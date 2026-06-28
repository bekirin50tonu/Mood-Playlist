// Zustand store for the user's musical DNA.
//
// Centralizes DNA state so the components and page.tsx don't reach into
// localStorage directly. The store is the single source of truth for the
// active DNA; localStorage is kept in sync (hydrate on init, persist on
// change) so the DNA survives reloads.

import { create } from "zustand";
import type { MusicalDna } from "./dna";
import { readDna, writeDna, clearDna } from "./dna";

export type DnaStatus = "idle" | "loading" | "ready" | "error";

type DnaStore = {
  dna: MusicalDna | null;
  status: DnaStatus;
  error: string | null;

  /** Hydrate from localStorage. Call once on app mount. */
  hydrate: () => void;

  /** Set DNA directly (e.g. after a successful fetch) and persist it. */
  setDna: (dna: MusicalDna) => void;

  /** Recompute DNA from Spotify and store + persist the result. */
  recalculate: () => Promise<void>;

  /** Clear DNA from both state and storage. */
  clear: () => void;
};

export const useDnaStore = create<DnaStore>()((set, get) => ({
  dna: null,
  status: "idle",
  error: null,

  hydrate: () => {
    const stored = readDna();
    if (stored) set({ dna: stored, status: "ready" });
  },

  setDna: (dna) => {
    writeDna(dna);
    set({ dna, status: "ready", error: null });
  },

  recalculate: async () => {
    set({ status: "loading", error: null });
    try {
      const res = await fetch("/api/dna", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const { dna } = (await res.json()) as { dna: MusicalDna };
      // Persist + store in one place.
      get().setDna(dna);
    } catch (err) {
      const message = (err as Error).message;
      set({ status: "error", error: message });
      throw err;
    }
  },

  clear: () => {
    clearDna();
    set({ dna: null, status: "idle", error: null });
  },
}));
