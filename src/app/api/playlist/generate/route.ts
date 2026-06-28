import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pickSeeds, type MusicalDnaSummary } from "@/lib/gemini";
import {
  addTracksToPlaylist,
  createPlaylist,
  getRecommendations,
  type SpotifyRecommendation,
} from "@/lib/spotify";
import { withValidToken, type SessionData } from "@/lib/session";
import { readDna } from "@/lib/dna";

export const dynamic = "force-dynamic";
const MAX_SONGS = 50;
const MIN_SONGS = 1;

type GenerateBody = {
  feeling?: unknown;
  mood?: unknown;
  count?: unknown;
  dna?: MusicalDnaSummary;
};

function clampCount(n: unknown): number {
  const num = typeof n === "number" ? n : parseInt(String(n), 10);
  if (Number.isNaN(num)) return 10;
  return Math.min(MAX_SONGS, Math.max(MIN_SONGS, Math.round(num)));
}

export async function POST(req: NextRequest) {
  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const feeling = String(body?.feeling ?? "").trim();
  const mood = String(body?.mood ?? "").trim();
  const count = clampCount(body?.count);

  if (!feeling || !mood) {
    return NextResponse.json(
      { error: "feeling and mood are required" },
      { status: 400 },
    );
  }

  // DNA is optional — user may not have computed it yet.
  const dna: MusicalDnaSummary | null = body?.dna ?? readDna();

  try {
    const seeds = await pickSeeds({ feeling, mood, dna, count });

    const tracks = await withValidToken(() =>
      getRecommendations({
        seed_artists: seeds.seed_artists,
        seed_genres: seeds.seed_genres,
        seed_tracks: seeds.seed_tracks,
        limit: count,
        target: seeds.target,
      }),
    );

    if (!tracks.length) {
      return NextResponse.json(
        {
          error:
            "Spotify returned no recommendations for these seeds. Try a different mood.",
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
    const out = await withValidToken(async (_accessToken: string, session: SessionData): Promise<PlaylistOutcome> => {
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
    }).catch((err: unknown) => {
      // Playlist creation is non-critical if scopes/parsing fail — still return tracks.
      return { playlist: null, createError: (err as Error).message };
    });

    return NextResponse.json({
      seeds,
      playlist: out.playlist,
      createError: out.createError ?? null,
      tracks: tracks.map((t: SpotifyRecommendation) => ({
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
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
