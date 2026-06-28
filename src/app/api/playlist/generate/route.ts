import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pickSeeds } from "@/lib/gemini";
import {
  addTracksToPlaylist,
  createPlaylist,
  getTopArtists,
  searchTracks,
  type TrackCandidate,
} from "@/lib/spotify";
import { withValidToken, type SessionData } from "@/lib/session";
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

  const { feeling, mood, count } = body;
  const dna = body.dna ?? null;

  try {
    // Resolve the DNA the client didn't send: fetch the user's top artists so
    // Gemini has a taste profile even on a fresh page load.
    let resolvedDna = dna;
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

    const seeds = await pickSeeds({ feeling, mood, dna: resolvedDna, count });

    // Build a search query from the feeling + mood + DNA. Without
    // /v1/recommendations (restricted for new apps), /v1/search is our source
    // of candidate tracks. The query combines the mood with the top genre so
    // results bend toward the user's taste.
    const genreHint = resolvedDna?.topGenres?.[0];
    const seedGenre = seeds.seed_genres[0];
    const q = [feeling, mood, seedGenre ?? genreHint]
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

    // Best-effort playlist creation: if the user is logged in we create a
    // playlist in their account; otherwise we return the track list only.
    type PlaylistOutcome = {
      playlist: { id: string; external_urls: { spotify: string } } | null;
      createError?: string;
    };
    const out = await withValidToken(
      async (_accessToken: string, session: SessionData): Promise<PlaylistOutcome> => {
        const playlist = await createPlaylist(
          session.user.id,
          seeds.playlistMoodLabel,
          `Generated from feeling "${feeling}" and mood "${mood}" on ${new Date().toLocaleString()} • ${tracks.length} songs`,
          false,
        );
        await addTracksToPlaylist(
          playlist.id,
          tracks.map((t) => `spotify:track:${t.id}`),
        );
        return { playlist };
      },
    ).catch((err: unknown) => {
      // Playlist creation is non-critical if scopes/parsing fail — still return tracks.
      return { playlist: null, createError: (err as Error).message };
    });

    return NextResponse.json({
      seeds,
      playlist: out.playlist,
      createError: out.createError ?? null,
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
