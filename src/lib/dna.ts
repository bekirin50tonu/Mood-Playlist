// Musical DNA: derived from the user's recently-played tracks' audio features
// and artist genres. Spotify has no "musical DNA" endpoint, so we compute it
// ourselves and persist it to localStorage on the client.

export const DNA_KEY = "spotify_musical_dna";

export type MusicalDna = {
  generatedAt: string;
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

export function readDna(): MusicalDna | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DNA_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MusicalDna;
  } catch {
    return null;
  }
}

export function writeDna(dna: MusicalDna): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DNA_KEY, JSON.stringify(dna));
}

export function clearDna(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DNA_KEY);
}

type AudioFeature = {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  tempo: number;
  duration_ms: number;
} | null;

type Artist = { genres: string[] } | null;

function round(n: number, p = 3): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

type FeatureKey =
  | "energy"
  | "valence"
  | "danceability"
  | "acousticness"
  | "instrumentalness"
  | "speechiness"
  | "liveness"
  | "tempo"
  | "duration_ms";

export function computeDna(args: {
  audioFeatures: AudioFeature[];
  artists: Artist[];
}): MusicalDna {
  const validFeatures = args.audioFeatures.filter(
    (f): f is NonNullable<typeof f> =>
      !!f &&
      typeof f.energy === "number" &&
      !Number.isNaN(f.energy),
  );

  const avgField = (key: FeatureKey) =>
    round(avg(validFeatures.map((f) => (f[key] as number) ?? 0)));

  // Count genre frequencies across all artists, keep top 5.
  const counts = new Map<string, number>();
  for (const artist of args.artists) {
    if (!artist) continue;
    for (const genre of artist.genres ?? []) {
      const g = genre.trim().toLowerCase();
      if (!g) continue;
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }
  const topGenres = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([g]) => g);

  return {
    generatedAt: new Date().toISOString(),
    topGenres,
    averages: {
      energy: avgField("energy"),
      valence: avgField("valence"),
      danceability: avgField("danceability"),
      acousticness: avgField("acousticness"),
      instrumentalness: avgField("instrumentalness"),
      speechiness: avgField("speechiness"),
      liveness: avgField("liveness"),
      tempo: round(avgField("tempo"), 1),
      durationMs: Math.round(avgField("duration_ms")),
    },
    trackCount: validFeatures.length,
  };
}
