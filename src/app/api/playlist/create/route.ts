import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { addTracksToPlaylist, createPlaylist } from "@/lib/spotify";
import { withValidToken, type SessionData } from "@/lib/session";
import {
  playlistCreateRequestSchema,
  ValidationError,
  formatIssues,
  parseOrFail,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";

// Dedicated "save to Spotify" action. Generation (search + Gemini) is handled
// by /api/playlist/generate; this route only persists an already-generated
// track list as a new playlist. Split out so the user can regenerate freely,
// then save exactly the set they like.
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let body: { name: string; description?: string; trackIds: string[] };
  try {
    body = parseOrFail(playlistCreateRequestSchema, raw);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json(
        { error: "Validation failed", details: formatIssues(err.issues) },
        { status: 400 },
      );
    }
    throw err;
  }

  try {
    const playlist = await withValidToken(
      async (_accessToken: string, session: SessionData) => {
        const created = await createPlaylist(
          session.user.id,
          body.name,
          body.description ?? `Mood Playlist • ${body.trackIds.length} songs`,
          false,
        );
        await addTracksToPlaylist(
          created.id,
          body.trackIds.map((id) => `spotify:track:${id}`),
        );
        return created;
      },
    );

    return NextResponse.json({
      playlist: {
        id: playlist.id,
        external_urls: playlist.external_urls,
      },
    });
  } catch (err) {
    console.error("playlist/create failed:", err);
    const status =
      typeof (err as { status?: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return NextResponse.json(
      { error: (err as Error).message },
      { status },
    );
  }
}
