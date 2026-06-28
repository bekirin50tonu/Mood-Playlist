"use client";

import { useState } from "react";
import type { MusicalDna } from "@/lib/dna";
import { readDna } from "@/lib/dna";

type Status = "idle" | "loading" | "error" | "success";

export function MusicalDnaCard() {
  // Read lazily from localStorage on first render only — avoids a cascading
  // render from a synchronous setState inside an effect.
  const [dna, setDna] = useState<MusicalDna | null>(() => readDna());
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // No server-side invalidation flag anymore — DNA lives in localStorage
  // until the user explicitly recalculates or clears site data.

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
            Derived from your recently-played tracks. Saved on this device.
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
        <div className="space-y-4">
          {dna.topGenres.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                Top genres
              </p>
              <div className="flex flex-wrap gap-1.5">
                {dna.topGenres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full bg-spotify/15 text-spotify border border-spotify/30 px-2.5 py-0.5 text-xs capitalize"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Energy" value={dna.averages.energy} />
            <Stat label="Valence" value={dna.averages.valence} />
            <Stat label="Danceability" value={dna.averages.danceability} />
            <Stat label="Acousticness" value={dna.averages.acousticness} />
            <Stat label="Tempo" value={`${dna.averages.tempo} BPM`} />
            <Stat label="Liveness" value={dna.averages.liveness} />
            <Stat label="Speechiness" value={dna.averages.speechiness} />
            <Stat
              label="Sampled"
              value={`${dna.trackCount} tracks`}
            />
          </div>

          <p className="text-[11px] text-neutral-600">
            Generated {new Date(dna.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-neutral-950/60 border border-neutral-800/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="text-sm font-medium tabular-nums">
        {typeof value === "number" ? value.toFixed(2) : value}
      </p>
    </div>
  );
}
