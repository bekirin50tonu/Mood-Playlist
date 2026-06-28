// Calls Gemini 3.5 Flash Lite to turn a user's feeling + mood + musical DNA
// into Spotify search seeds (artists, genres, tracks) + a playlist title.
//
// NOTE (Nov 2024 Spotify change): /v1/recommendations and /v1/audio-features
// are restricted for new apps. We no longer ask for numeric target audio
// features (there's nowhere to send them); instead we ask for seed
// genres/artists/tracks and a search-friendly mood label, then build the
// playlist from /v1/search results. The DNA is genre + track/artist based, so
// the prompt is richer in track/artist context to compensate for the lost
// numeric taste profile.

import { GoogleGenAI } from "@google/genai";
import {
  geminiSeedsSchema,
  normalizeGeminiSeeds,
  type GeminiSeedsInput,
} from "./schemas";

export type MusicalDnaSummary = {
  topGenres: string[];
  topTracks: { name: string; artists: string[] }[];
  topArtists: { name: string; genres: string[] }[];
  tasteSummary: string;
};

export type GeminiSeeds = {
  seed_artists: string[]; // spotify:artist:... or bare 22-char ids
  seed_genres: string[]; // plain genre keywords
  seed_tracks: string[]; // spotify:track:... or bare 22-char ids
  playlistMoodLabel: string;
};

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey: key });
}

function asSpotifyUri(prefix: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("spotify:")) return trimmed;
  // If it looks like a bare id, prefix it.
  if (/^[0-9A-Za-z]{22}$/.test(trimmed)) return `spotify:${prefix}:${trimmed}`;
  return trimmed;
}

export async function pickSeeds(args: {
  feeling: string;
  mood: string;
  genre: string;
  dna: MusicalDnaSummary | null;
  count: number;
}): Promise<GeminiSeeds> {
  const client = getClient();
  const model = "gemini-3.1-flash-lite";

  const dnaText = args.dna
    ? JSON.stringify(
        {
          tasteSummary: args.dna.tasteSummary,
          topGenres: args.dna.topGenres,
          topTracks: args.dna.topTracks.map((t) => `${t.name} by ${t.artists.join(", ")}`),
          topArtists: args.dna.topArtists.map((a) => `${a.name} [${a.genres.slice(0, 3).join(", ")}]`),
        },
        null,
        2,
      )
    : "No DNA available (user has not listened enough or DNA not computed yet).";

  // The user-supplied genre (if any) is the strongest signal — it should
  // anchor the seed picks. When empty, fall back to DNA/mood blending.
  const genreLine = args.genre
    ? `The user specifically wants this genre/style: "${args.genre}". Make this the primary anchor for your seed picks — choose seed_artists, seed_genres, and seed_tracks that fit it.`
    : "No specific genre requested — blend the user's DNA with their mood.";

  const prompt = `You are a music curator. The user wants a Spotify playlist.

Today they feel: "${args.feeling}"
Their mood is: "${args.mood}"
They want ${args.count} songs.
${genreLine}

Their musical DNA (derived from their top artists, top tracks, and recent listening) is:
${dnaText}

Pick search seeds that match the requested genre/style (if any) blended with
their DNA and mood. Suggest real, specific artists and tracks the user is
likely to enjoy — lean on their top artists/tracks when picking seed_artists
and seed_tracks.

Return ONLY valid JSON — no markdown, no commentary, no code fences:
{
  "seed_artists": ["spotify:artist:..."],   // up to 3 Spotify artist URIs or bare 22-char ids
  "seed_genres": ["chill", "indie-pop"],     // up to 3 genre keywords
  "seed_tracks": ["spotify:track:..."],      // up to 3 Spotify track URIs or bare 22-char ids
  "playlistMoodLabel": "A short (<= 40 chars) evocative playlist title"
}`;

  const res = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      temperature: 0.8,
      maxOutputTokens: 1024,
    },
  });

  const text = res.text ?? res.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");

  // Strip code fences if the model ignored instructions, then validate the
  // shape with Zod. Validation gives us one clear error path for malformed
  // model output.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: GeminiSeedsInput;
  try {
    // Schema accepts a flat shape or a { playlist: { ... } } wrapper —
    // normalize to the flat shape before reading fields.
    parsed = normalizeGeminiSeeds(geminiSeedsSchema.parse(JSON.parse(cleaned)));
  } catch (err) {
    throw new Error(
      `Gemini returned invalid seeds: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    );
  }

  return {
    seed_artists: parsed.seed_artists
      .slice(0, 3)
      .map((a) => asSpotifyUri("artist", a))
      .filter(Boolean),
    seed_genres: parsed.seed_genres.slice(0, 3),
    seed_tracks: parsed.seed_tracks
      .slice(0, 3)
      .map((t) => asSpotifyUri("track", t))
      .filter(Boolean),
    playlistMoodLabel:
      parsed.playlistMoodLabel || `${args.mood} • ${args.feeling}`,
  };
}
