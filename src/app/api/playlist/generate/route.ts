import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pickSeeds, type MusicalDnaSummary } from "@/lib/gemini";
import {
  getTopArtists,
  searchTracks,
  type TrackCandidate,
} from "@/lib/spotify";
import { withValidToken } from "@/lib/session";
import {
  generateRequestSchema,
  ValidationError,
  formatIssues,
  parseOrFail,
  type DnaSummaryInput,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let body: {
    feeling: string;
    mood: string;
    count: number;
    genre: string;
    artist: string;
    dna?: DnaSummaryInput | null;
  };
  try {
    body = parseOrFail(generateRequestSchema, raw);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: "Validation failed", details: formatIssues(err.issues) },
        { status: 400 },
      );
    }
    throw err;
  }

  const { feeling, mood, count, genre, artist } = body;
  const trimmedGenre = genre.trim();
  const trimmedArtist = artist.trim();
  const dna = body.dna ?? null;

  try {
    // Resolve the DNA the client didn't send: fetch the user's top artists so
    // Gemini has a taste profile even on a fresh page load.
    let resolvedDna: MusicalDnaSummary | null = dna;
    if (!resolvedDna) {
      const topArtists = await withValidToken(() => getTopArtists(10));
      resolvedDna = {
        topGenres: Array.from(
          new Set(topArtists.flatMap((a) => a.genres)),
        ).slice(0, 5),
        topTracks: [],
        topArtists: topArtists.map((a) => ({
          name: a.name,
          genres: a.genres.slice(0, 3),
        })),
        tasteSummary: "",
      };
    }

    const seeds = await pickSeeds({
      feeling,
      mood,
      genre: trimmedGenre,
      artist: trimmedArtist,
      dna: resolvedDna,
      count,
    });

    // Build a search query. Without /v1/recommendations (restricted for new
    // apps), /v1/search is our source of candidate tracks. Priority ordering:
    // 1. Artist override (highest), 2. Genre override, 3. Feeling + mood,
    // 4. Gemini's seed genre / DNA top genre.
    const genreHint = resolvedDna?.topGenres?.[0];
    const seedGenre = seeds.seed_genres[0];
    const q = [
      trimmedArtist || null,
      trimmedGenre || null,
      feeling,
      mood,
      seedGenre || genreHint || null,
    ]
      .filter(Boolean)
      .join(" ");

    let tracks = await withValidToken(() => searchTracks(q, count));

    // Dedupe by id — search can overlap with seeds / overlap itself.
    const seen = new Set<string>();
    tracks = tracks.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    if (!tracks.length) {
      return NextResponse.json(
        {
          error: `No tracks found for "${q}". Try a different mood or feeling.`,
          seeds,
        },
        { status: 404 },
      );
    }

    // Tracks only. Saving to a Spotify account is a separate, explicit action
    // handled by POST /api/playlist/create (the "Create Playlist" button) so
    // the user can regenerate freely before deciding what to save.
    return NextResponse.json({
      seeds,
      tracks: tracks.map((t: TrackCandidate) => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map((a) => a.name),
        album: t.album.name,
        albumImage: t.album.images?.[0]?.url ?? null,
        previewUrl: t.preview_url,
        url: t.external_urls?.spotify,
        durationMs: t.duration_ms,
      })),
    });
  } catch (err) {
    console.error("playlist/generate failed:", err);
    const status =
      typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
