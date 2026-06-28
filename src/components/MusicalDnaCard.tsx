"use client";

import { useState } from "react";
import type { MusicalDna } from "@/lib/dna";

type Status = "idle" | "loading" | "error" | "success";

export function MusicalDnaCard() {
  const [dna, setDna] = useState<MusicalDna | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function recalculate() {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/dna");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setDna(data.dna);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
    }
  }

  return (
    <section className="w-full max-w-2xl mx-auto rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Your musical DNA</h3>
          <p className="text-xs text-neutral-500">
            Derived from your top artists, top tracks, and recent listening.
            Saved per session.
          </p>
        </div>
        <button
          onClick={recalculate}
          disabled={status === "loading"}
          className="rounded-full border border-neutral-700 hover:border-spotify/60 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-sm transition-colors"
        >
          {status === "loading" ? "Computing…" : "Recalculate"}
        </button>
      </header>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : !dna ? (
        <p className="text-sm text-neutral-400">
          No DNA yet. Click <em>Recalculate</em> to derive your taste from your
          recent listening.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-neutral-300">{dna.tasteSummary}</p>

          {dna.topGenres.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                Top genres
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dna.topGenreCounts.map(({ genre, count }) => (
                  <span
                    key={genre}
                    className="rounded-full bg-spotify/15 text-spotify border border-spotify/30 px-2.5 py-0.5 text-xs capitalize"
                  >
                    {genre}
                    <span className="ml-1 text-spotify/60">×{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {dna.topTracks.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                Top tracks
              </p>
              <ul className="space-y-1.5">
                {dna.topTracks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg bg-neutral-950/40 border border-neutral-800/50 px-2.5 py-1.5"
                  >
                    {t.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.image}
                        alt={t.name}
                        className="h-9 w-9 rounded object-cover"
                      />
                    ) : (
                      <span className="h-9 w-9 rounded bg-neutral-800" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{t.name}</span>
                      <span className="block text-xs text-neutral-500 truncate">
                        {t.artists.join(", ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dna.topArtists.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                Top artists
              </p>
              <div className="flex flex-wrap gap-2">
                {dna.topArtists.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-2 rounded-full bg-neutral-950/40 border border-neutral-800/50 pl-1 pr-3 py-1"
                  >
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.image}
                        alt={a.name}
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <span className="h-6 w-6 rounded-full bg-neutral-800" />
                    )}
                    <span className="text-xs">{a.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-neutral-600">
            From {dna.trackCount} recent tracks • generated{" "}
            {new Date(dna.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}
