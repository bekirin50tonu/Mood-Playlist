"use client";

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
  playlistUrl: string | null;
  createError: string | null;
  tracks: GeneratedTrack[];
  feeling: string;
  mood: string;
  onReset: () => void;
};

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlaylistResult({
  playlistUrl,
  createError,
  tracks,
  feeling,
  mood,
  onReset,
}: PlaylistResultProps) {
  return (
    <section className="w-full max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          {feeling && mood
            ? `${mood} • ${feeling}`
            : "Your playlist"}{" "}
            <span className="text-neutral-500 font-normal">({tracks.length} songs)</span>
        </h2>
        <button
          onClick={onReset}
          className="text-sm text-neutral-400 hover:text-neutral-200 underline-offset-4 hover:underline"
        >
          Generate another
        </button>
      </div>

      {playlistUrl ? (
        <a
          href={playlistUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-5 flex items-center justify-between rounded-2xl bg-neutral-900 border border-neutral-800 px-5 py-4 hover:border-spotify/60 transition-colors"
        >
          <div>
            <p className="text-sm text-neutral-400">Open in Spotify</p>
            <p className="font-medium text-spotify">{playlistUrl}</p>
          </div>
          <span aria-hidden className="text-2xl">↗</span>
        </a>
      ) : (
        <p className="mb-5 rounded-xl bg-amber-900/30 border border-amber-700/40 px-4 py-3 text-sm text-amber-200">
          {createError
            ? `Couldn't save to your Spotify account (${createError}). Here are the tracks anyway.`
            : "Here are the tracks — log in to save them to your Spotify."}
        </p>
      )}

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
              <p className="truncate text-sm text-neutral-400" title={t.artists.join(", ")}>
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
