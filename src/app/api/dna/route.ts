import { NextResponse } from "next/server";
import {
  getArtists,
  getRecentlyPlayed,
  getTopArtists,
  getTopTracks,
} from "@/lib/spotify";
import { withValidToken } from "@/lib/session";
import {
  computeDna,
  type MusicalDna,
  type TrackSummary,
  type ArtistSummary,
} from "@/lib/dna";

export const dynamic = "force-dynamic";

// Build the user's musical DNA from endpoints that remain available to new
// apps: /v1/me/top/artists, /v1/me/top/tracks, /v1/me/player/recently-played,
// and /v1/artists (for genres). /v1/audio-features is restricted (Nov 2024
// change) with no replacement, so the DNA is genre + track/artist based.
async function buildDna(): Promise<MusicalDna> {
  const [topTracks, topArtists, recent] = await Promise.all([
    getTopTracks(10),
    getTopArtists(10),
    getRecentlyPlayed(50),
  ]);

  // Collect unique artist ids across top tracks + recent tracks so we can fetch
  // genres. (/v1/me/top/artists already returns genres, but we also pull genres
  // from the artists of recent/top tracks for a fuller picture.)
  const artistIds = Array.from(
    new Set([
      ...topArtists.map((a) => a.id),
      ...topTracks.flatMap((t) => t.artists.map((a) => a.id)),
      ...recent.items.flatMap((i) =>
        i.track.artists.map((a) => a.id),
      ),
    ].filter(Boolean)),
  );

  const { artists: artistDetails } = await getArtists(artistIds);

  // Merge genres: prefer the detailed /v1/artists genres, fall back to
  // top_artists genres.
  const genresById = new Map<string, string[]>();
  for (const a of artistDetails) genresById.set(a.id, a.genres);
  const genresOf = (id: string, fallback: string[]) =>
    genresById.get(id) ?? fallback;

  const genres: string[] = [];
  for (const a of topArtists) genres.push(...genresOf(a.id, a.genres));
  for (const id of artistIds) genres.push(...genresOf(id, []));

  const toTrackSummary = (t: (typeof topTracks)[number]): TrackSummary => ({
    id: t.id,
    name: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album.name,
    image: t.album.images?.[0]?.url ?? null,
  });

  const toArtistSummary = (a: (typeof topArtists)[number]): ArtistSummary => ({
    id: a.id,
    name: a.name,
    image: a.images?.[0]?.url ?? null,
    genres: genresOf(a.id, a.genres),
  });

  const uniqueRecentIds = new Set(recent.items.map((i) => i.track.id));

  const dna: MusicalDna = {
    generatedAt: new Date().toISOString(),
    ...computeDna({
      genres,
      topTracks: topTracks.map(toTrackSummary),
      topArtists: topArtists.map(toArtistSummary),
      recentTrackCount: uniqueRecentIds.size,
    }),
  };

  return dna;
}

export async function GET() {
  try {
    const dna = await withValidToken(() => buildDna());
    return NextResponse.json({ dna });
  } catch (err) {
    console.error("dna route failed:", err);
    const status =
      typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
