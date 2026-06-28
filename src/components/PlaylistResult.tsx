"use client";

import { useState } from "react";

export type GeneratedTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  albumImage: string | null;
  previewUrl: string | null;
  url: string | null;
  durationMs: number;
};

export type PlaylistResultProps = {
  tracks: GeneratedTrack[];
  feeling: string;
  mood: string;
  onReset: () => void;
  // Save-to-Spotify action. The parent owns the network call so it can pass
  // the Gemini-picked name + the current track ids.
  playlistName: string;
  onCreatePlaylist: (name: string, trackIds: string[]) => Promise<string | null>;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlaylistResult({
  tracks,
  feeling,
  mood,
  onReset,
  playlistName,
  onCreatePlaylist,
}: PlaylistResultProps) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaveState("saving");
    setSaveError(null);
    try {
      const url = await onCreatePlaylist(
        playlistName,
        tracks.map((t) => t.id),
      );
      if (!url) throw new Error("No playlist URL returned");
      setSavedUrl(url);
      setSaveState("saved");
    } catch (err) {
      setSaveError((err as Error).message);
      setSaveState("error");
    }
  }

  return (
    <section className="w-full max-w-2xl mx-auto animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold">
          {feeling && mood
            ? `${mood} • ${feeling}`
            : "Your playlist"}{" "}
          <span className="text-neutral-500 font-normal">
            ({tracks.length} songs)
          </span>
        </h2>

        <div className="flex items-center gap-2">
          {saveState === "saved" && savedUrl ? (
            <a
              href={savedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-spotify/15 text-spotify border border-spotify/30 px-3 py-1.5 text-sm font-medium hover:bg-spotify/25 transition-colors"
            >
              Open in Spotify <span aria-hidden>↗</span>
            </a>
          ) : (
            <button
              onClick={handleSave}
              disabled={saveState === "saving" || !tracks.length}
              className="inline-flex items-center gap-1.5 rounded-full bg-spotify text-neutral-950 px-4 py-1.5 text-sm font-semibold hover:bg-spotify-dark active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-spotify/20"
            >
              {saveState === "saving" ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-neutral-950/40 border-t-neutral-950 animate-spin-slow" />
                  Saving…
                </>
              ) : (
                <>Create Playlist</>
              )}
            </button>
          )}

          <button
            onClick={onReset}
            className="rounded-full border border-neutral-700 hover:border-neutral-500 px-4 py-1.5 text-sm text-neutral-300 transition-colors"
          >
            Generate Another
          </button>
        </div>
      </div>

      {saveState === "error" && saveError ? (
        <p className="mb-4 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Couldn&apos;t save to Spotify: {saveError}
        </p>
      ) : null}

      <ol className="space-y-2">
        {tracks.map((t, i) => (
          <li
            key={t.id}
            className="flex items-center gap-3 rounded-xl bg-neutral-900/60 border border-neutral-800/60 px-3 py-2 hover:bg-neutral-900 transition-colors"
          >
            <span className="w-7 text-right text-sm text-neutral-500 tabular-nums">
              {i + 1}
            </span>
            {t.albumImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={t.albumImage}
                alt={t.album}
                className="h-11 w-11 rounded-md object-cover"
              />
            ) : (
              <span className="h-11 w-11 rounded-md bg-neutral-800" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={t.name}>
                {t.name}
              </p>
              <p
                className="truncate text-sm text-neutral-400"
                title={t.artists.join(", ")}
              >
                {t.artists.join(", ")} • {t.album}
              </p>
            </div>
            <span className="text-xs text-neutral-500 tabular-nums">
              {formatDuration(t.durationMs)}
            </span>
            {t.url ? (
              <a
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-spotify text-sm"
                title="Open in Spotify"
              >
                ↗
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
