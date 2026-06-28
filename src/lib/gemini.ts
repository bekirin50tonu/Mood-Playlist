// Calls Gemini 3.5 Flash Lite to turn a user's feeling + mood + musical DNA
// into Spotify Recommendation seeds (artists, genres, tracks, target features).

import { GoogleGenAI } from "@google/genai";

export type MusicalDnaSummary = {
  topGenres: string[];
  averages: {
    energy: number;
    valence: number;
    danceability: number;
    acousticness: number;
    instrumentalness: number;
    speechiness: number;
    liveness: number;
    tempo: number;
    durationMs: number;
  };
  trackCount: number;
};

export type GeminiSeeds = {
  seed_artists: string[]; // spotify:artist:...
  seed_genres: string[]; // plain genre names
  seed_tracks: string[]; // spotify:track:...
  target: {
    energy: number;
    valence: number;
    danceability: number;
    acousticness: number;
    instrumentalness: number;
    speechiness: number;
    liveness: number;
    tempo: number;
  };
  playlistMoodLabel: string;
};

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey: key });
}

function clamp01(n: unknown, fallback = 0.5): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clampTempo(n: unknown, fallback = 110): number {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return Math.max(40, Math.min(220, n));
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
  dna: MusicalDnaSummary | null;
  count: number;
}): Promise<GeminiSeeds> {
  const client = getClient();
  const model = "gemini-3.1-flash-lite";

  const dnaText = args.dna
    ? JSON.stringify(
        {
          topGenres: args.dna.topGenres,
          averages: args.dna.averages,
          trackCount: args.dna.trackCount,
        },
        null,
        2,
      )
    : "No DNA available (user has not listened enough or DNA not computed yet).";

  const prompt = `You are a music curator. The user wants a Spotify playlist.

Today they feel: "${args.feeling}"
Their mood is: "${args.mood}"
They want ${args.count} songs.

Their musical DNA (averages over their recent listening) is:
${dnaText}

Pick seeds for Spotify's /v1/recommendations endpoint that blend their DNA
with today's mood. Prefer genres that overlap with their DNA. Adjust target
audio features (energy, valence, danceability, acousticness) to match the mood.

Return ONLY valid JSON — no markdown, no commentary, no code fences:
{
  "seed_artists": ["spotify:artist:..."],   // up to 2 Spotify artist URIs or bare 22-char ids
  "seed_genres": ["chill", "indie-pop"],     // up to 2 genre keywords
  "seed_tracks": ["spotify:track:..."],      // up to 2 Spotify track URIs or bare 22-char ids
  "target": {
    "energy": 0.0-1.0,
    "valence": 0.0-1.0,
    "danceability": 0.0-1.0,
    "acousticness": 0.0-1.0,
    "instrumentalness": 0.0-1.0,
    "speechiness": 0.0-1.0,
    "liveness": 0.0-1.0,
    "tempo": 40-220   // BPM
  },
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

  let parsed: {
    seed_artists?: string[];
    seed_genres?: string[];
    seed_tracks?: string[];
    target?: Record<string, number>;
    playlistMoodLabel?: string;
  };
  try {
    // Strip code fences if the model ignored instructions.
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON: ${(err as Error).message}`);
  }

  const target = parsed.target ?? {};
  return {
    seed_artists: (parsed.seed_artists ?? [])
      .slice(0, 2)
      .map((a: string) => asSpotifyUri("artist", a))
      .filter(Boolean),
    seed_genres: (parsed.seed_genres ?? []).slice(0, 2).map(String),
    seed_tracks: (parsed.seed_tracks ?? [])
      .slice(0, 2)
      .map((t: string) => asSpotifyUri("track", t))
      .filter(Boolean),
    target: {
      energy: clamp01(target.energy, args.dna?.averages.energy ?? 0.5),
      valence: clamp01(target.valence, args.dna?.averages.valence ?? 0.5),
      danceability: clamp01(
        target.danceability,
        args.dna?.averages.danceability ?? 0.5,
      ),
      acousticness: clamp01(
        target.acousticness,
        args.dna?.averages.acousticness ?? 0.5,
      ),
      instrumentalness: clamp01(
        target.instrumentalness,
        args.dna?.averages.instrumentalness ?? 0.0,
      ),
      speechiness: clamp01(
        target.speechiness,
        args.dna?.averages.speechiness ?? 0.05,
      ),
      liveness: clamp01(target.liveness, args.dna?.averages.liveness ?? 0.15),
      tempo: clampTempo(target.tempo, args.dna?.averages.tempo ?? 110),
    },
    playlistMoodLabel: String(
      parsed.playlistMoodLabel ?? `${args.mood} • ${args.feeling}`,
    ).slice(0, 60),
  };
}
