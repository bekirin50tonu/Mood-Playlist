// Shared Zod request schemas for the API routes.
//
// Centralizing validation here keeps the route handlers thin and gives us a
// single source of truth for what each endpoint accepts. Each route calls
// `.safeParse` and returns a 400 with field-level issues on failure.

import { z } from "zod";

// ── Musical DNA (client-persisted, optionally sent to the generator) ───────
//
// NOTE (Nov 2024 Spotify change): audio-feature averages are gone —
// /v1/audio-features and /v1/audio-analysis are restricted for new apps with
// no replacement endpoint. DNA is now genre + track/artist based.

// The client persists the full MusicalDna shape (generatedAt, id, image, etc.)
// to localStorage and sends it back to the generate route. We only care about
// the fields Gemini needs (topGenres, topTracks, topArtists, tasteSummary),
// so we validate those and allow extra fields through with .passthrough()
// rather than .strict().

const trackSummarySchema = z
  .object({
    name: z.string().trim().min(1),
    artists: z.array(z.string()).max(10),
  })
  .passthrough();

const artistSummarySchema = z
  .object({
    name: z.string().trim().min(1),
    genres: z.array(z.string()).max(10),
  })
  .passthrough();

export const dnaSummarySchema = z
  .object({
    topGenres: z.array(z.string().trim().min(1)).max(10),
    topTracks: z.array(trackSummarySchema).max(10),
    topArtists: z.array(artistSummarySchema).max(10),
    tasteSummary: z.string().max(200),
  })
  .passthrough();

export type DnaSummaryInput = z.infer<typeof dnaSummarySchema>;

// ── POST /api/playlist/generate ────────────────────────────────────────────

export const generateRequestSchema = z
  .object({
    feeling: z
      .string()
      .trim()
      .min(1, "feeling is required")
      .max(200),
    mood: z
      .string()
      .trim()
      .min(1, "mood is required")
      .max(200),
    // Coerce so a count arriving as a string query param still parses; fall
    // back to 10 when missing/NaN, then clamp to Spotify-friendly bounds.
    count: z.coerce.number().int().min(1).max(50).default(10),
    // Optional genre/style override — sent verbatim to Spotify search and
    // Gemini so results bend toward the requested style. Empty string and
    // missing key both treated as "no genre override".
    genre: z.string().trim().max(100).optional().default(""),
    // Optional artist override — prioritizes songs from this artist in search.
    artist: z.string().trim().max(100).optional().default(""),
    // The client sends dna: null when nothing is in localStorage yet, a DNA
    // object when present, or omits the key. Accept all three.
    dna: dnaSummarySchema.nullable().optional(),
  })
  .strict();

export type GenerateRequestInput = z.infer<typeof generateRequestSchema>;

// ── POST /api/playlist/create ──────────────────────────────────────────────

export const playlistCreateRequestSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(100),
    description: z.string().trim().max(300).optional(),
    trackIds: z
      .array(z.string().trim().min(1))
      .min(1, "at least one track is required")
      .max(100),
  })
  .strict();

export type PlaylistCreateRequestInput = z.infer<
  typeof playlistCreateRequestSchema
>;

// ── Gemini seed output (parsed from the model's JSON) ──────────────────────
//
// No "target" audio-feature block anymore (we can't send it anywhere without
// /recommendations). Gemini returns seeds + a title; we build candidates via
// /v1/search.
//
// The prompt asks for a flat object, but Gemini sometimes wraps the seeds in a
// single-key object (observed keys: "playlist", "songs", "tracks", "result",
// "seeds"). Rather than enumerate every key, accept:
//   - the flat shape, OR
//   - a single-key wrapper whose value is the flat shape.
// Strict mode is applied to the inner shape so we still reject truly
// malformed payloads (e.g. missing seed_artists).

const geminiSeedsFlatShape = {
  seed_artists: z.array(z.string()).max(5),
  seed_genres: z.array(z.string()).max(5),
  seed_tracks: z.array(z.string()).max(5),
  playlistMoodLabel: z.string().max(60),
} as const;

export const geminiSeedsFlatSchema = z.object(geminiSeedsFlatShape).strict();

// Gemini output validation. Accept any shape so we can try to extract the flat
// seed object from it. We validate the final extracted shape in the normalize
// step below.
export const geminiSeedsSchema = z
  .unknown()
  .transform((raw): GeminiSeedsInput => extractFlatSeeds(raw as unknown))
  .pipe(geminiSeedsFlatSchema);

// Extract the flat seed shape from whatever Gemini returned. Handles:
//   - flat { seed_artists, seed_genres, seed_tracks, playlistMoodLabel }
//   - { "wrapperKey": <flat shape> }  (any single-key wrapper)
//   - { "wrapperKey": [array of tracks/artists] }  (treat array as seeds)
// Returns default empty arrays/label if extraction fails.
function extractFlatSeeds(raw: unknown): GeminiSeedsInput {
  if (!raw || typeof raw !== "object") {
    return { seed_artists: [], seed_genres: [], seed_tracks: [], playlistMoodLabel: "" };
  }
  const obj = raw as Record<string, unknown>;
  // Already the flat shape (or already validated) — return as-is.
  if (
    obj.seed_artists !== undefined &&
    obj.seed_genres !== undefined &&
    obj.seed_tracks !== undefined
  ) {
    return {
      seed_artists: Array.isArray(obj.seed_artists) ? obj.seed_artists : [],
      seed_genres: Array.isArray(obj.seed_genres) ? obj.seed_genres : [],
      seed_tracks: Array.isArray(obj.seed_tracks) ? obj.seed_tracks : [],
      playlistMoodLabel:
        typeof obj.playlistMoodLabel === "string" ? obj.playlistMoodLabel : "",
    };
  }
  // Single-key wrapper: check if the value is an array (potential track list)
  // or another object. Recurse into objects, treat arrays as seed_tracks.
  const values = Object.values(obj);
  if (values.length === 1) {
    const inner = values[0];
    if (Array.isArray(inner)) {
      // Array of strings or objects — try to map to seed_tracks.
      const asTracks = inner
        .map((v) => (typeof v === "string" ? v : v?.id ?? v?.name ?? null))
        .filter(Boolean);
      return {
        seed_artists: [],
        seed_genres: [],
        seed_tracks: asTracks,
        playlistMoodLabel: "",
      };
    }
    if (typeof inner === "object") {
      return extractFlatSeeds(inner);
    }
  }
  // Fallback: could not parse.
  return { seed_artists: [], seed_genres: [], seed_tracks: [], playlistMoodLabel: "" };
}

export type GeminiSeedsInput = z.infer<typeof geminiSeedsFlatSchema>;
export function describeGeminiShape(data: unknown): string {
  if (!data || typeof data !== "object") return typeof data;
  const keys = Object.keys(data as object);
  if (keys.includes("seed_artists")) return `flat {${keys.join(",")}}`;
  const vals = Object.values(data as object);
  const firstKey = keys[0] ?? "(none)";
  const firstValIsArray = Array.isArray(vals[0]);
  return `wrapper {${firstKey} -> ${firstValIsArray ? "array" : typeof vals[0]}}`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Parse `data` against `schema`, throwing a ValidationError with issues on failure. */
export function parseOrFail<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("Validation failed", result.error.issues);
  }
  return result.data;
}

/** Format ZodIssues into a compact, human-readable string. */
export function formatIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
