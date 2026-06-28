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
// The prompt asks for a flat object, but Gemini sometimes wraps the seeds in
// a "playlist" (or similar) object. Accept both the flat shape and a one-level
// wrapper, then flatten — strict mode is applied to the inner shape so we
// still reject truly malformed payloads (e.g. missing seed_artists).

const geminiSeedsFlatSchema = z
  .object({
    seed_artists: z.array(z.string()).max(5),
    seed_genres: z.array(z.string()).max(5),
    seed_tracks: z.array(z.string()).max(5),
    playlistMoodLabel: z.string().max(60),
  })
  .strict();

// Known wrapping keys Gemini has been observed to use. We intentionally don't
// enumerate every possible key — just the ones we'd recognize. Any other
// wrapper shape still triggers a validation error.
const geminiSeedsWrapperSchema = z.object({
  playlist: geminiSeedsFlatSchema,
});

export const geminiSeedsSchema = z.union([
  geminiSeedsFlatSchema,
  geminiSeedsWrapperSchema,
]);

// Normalize either shape into the flat input type.
export function normalizeGeminiSeeds(
  data: z.infer<typeof geminiSeedsSchema>,
): GeminiSeedsInput {
  if ("playlist" in data && data.playlist && typeof data.playlist === "object") {
    return data.playlist;
  }
  return data as GeminiSeedsInput;
}

export type GeminiSeedsInput = z.infer<typeof geminiSeedsFlatSchema>;

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
