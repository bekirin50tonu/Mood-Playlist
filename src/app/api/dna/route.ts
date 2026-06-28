import { NextResponse } from "next/server";
import { getArtists, getAudioFeatures, getRecentlyPlayed } from "@/lib/spotify";
import { withValidToken } from "@/lib/session";
import { computeDna } from "@/lib/dna";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { items, audioFeatures, artists } = await withValidToken(
      async () => {
        const played = await getRecentlyPlayed(50);
        const tracks = played.items.map((i) => i.track).filter(Boolean);
        const uniqueTrackIds = Array.from(new Set(tracks.map((t) => t.id)));
        const uniqueArtistIds = Array.from(
          new Set(
            tracks.flatMap((t) => t.artists.map((a) => a.id)).filter(Boolean),
          ),
        );

        const [featRes, artRes] = await Promise.all([
          getAudioFeatures(uniqueTrackIds),
          getArtists(uniqueArtistIds),
        ]);

        type Feature = (typeof featRes.audio_features)[number];
        type Artist = (typeof artRes.artists)[number];

        return {
          items: played.items,
          audioFeatures: featRes.audio_features as Feature[],
          artists: artRes.artists as Artist[],
        };
      },
    );

    if (!items.length) {
      return NextResponse.json(
        { error: "No recently-played tracks found on your account." },
        { status: 404 },
      );
    }

    const dna = computeDna({ audioFeatures, artists });
    // Server-side write isn't useful (no localStorage), but we return the DNA
    // so the client can persist it.
    return NextResponse.json({ dna });
  } catch (err) {
    console.error("dna route failed:", err);
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
