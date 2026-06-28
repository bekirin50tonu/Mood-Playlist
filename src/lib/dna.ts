// Musical DNA: derived from the user's top artists + top tracks + recent
// listening. Spotify has no "musical DNA" endpoint, so we compute it ourselves
// and persist it to localStorage on the client.
//
// NOTE (Nov 2024 Spotify change): /v1/audio-features and /v1/audio-analysis are
// restricted for new apps without "extended mode" access. There is no
// replacement endpoint, so audio-feature averages (energy, valence, etc.) are
// no longer part of the DNA. The DNA is now genre + track/artist based, and the
// Gemini prompt compensates by receiving richer track/artist context instead of
// numeric taste profiles.

export const DNA_KEY = "spotify_musical_dna";

export type TrackSummary = {
  id: string;
  name: string;
  artists: string[]; // names only
  album: string;
  image: string | null; // first album image url
};

export type ArtistSummary = {
  id: string;
  name: string;
  image: string | null; // first artist image url
  genres: string[];
};

export type MusicalDna = {
  generatedAt: string;
  topGenres: string[]; // up to 5 genre names, lowercased, by frequency desc
  topGenreCounts: { genre: string; count: number }[]; // same genres with counts, for the UI
  topTracks: TrackSummary[]; // up to 10
  topArtists: ArtistSummary[]; // up to 10
  trackCount: number; // number of unique tracks sampled
  tasteSummary: string; // human-readable, e.g. "You love metal and pop"
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

// ── computation helpers ──────────────────────────────────────────────────────

export type DnaInput = {
  genres: string[]; // raw genre strings (may contain dupes across artists)
  topTracks: TrackSummary[];
  topArtists: ArtistSummary[];
  recentTrackCount: number;
};

export type DnaComputation = Omit<MusicalDna, "generatedAt">;

/** Lowercase + dedupe-aware genre frequency count, returned sorted by count desc. */
function rankGenres(genres: string[]): { genre: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const raw of genres) {
    const g = raw.trim().toLowerCase();
    if (!g) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
}

export function computeDna(input: DnaInput): DnaComputation {
  const ranked = rankGenres(input.genres);
  const topGenres = ranked.slice(0, 5).map((g) => g.genre);

  return {
    topGenres,
    topGenreCounts: ranked.slice(0, 5),
    topTracks: input.topTracks.slice(0, 10),
    topArtists: input.topArtists.slice(0, 10),
    trackCount: input.recentTrackCount,
    tasteSummary: summarizeTaste(topGenres),
  };
}

/** Build a short human-readable taste line, e.g. "You love metal and pop". */
export function summarizeTaste(topGenres: string[]): string {
  if (!topGenres.length) return "Your taste is a mystery so far.";
  // Capitalize the first letter of each genre for display.
  const fmt = (g: string) => g.charAt(0).toUpperCase() + g.slice(1);
  if (topGenres.length === 1) return `You love ${fmt(topGenres[0])}.`;
  const head = topGenres.slice(0, -1).map(fmt).join(", ");
  const last = fmt(topGenres[topGenres.length - 1]);
  return `You love ${head} and ${last}.`;
}
