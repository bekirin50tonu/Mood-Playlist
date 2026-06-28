"use client";

import { useState } from "react";
import type { MusicalDna } from "@/lib/dna";
import { readDna } from "@/lib/dna";

type FormErrors = {
  feeling?: string;
  mood?: string;
  count?: string;
};

export type MoodSubmit = {
  feeling: string;
  mood: string;
  count: number;
  dna: MusicalDna | null;
};

const MAX_SONGS = 50;
const MIN_SONGS = 1;

export function MoodForm({
  onSubmit,
  isLoggedIn,
}: {
  onSubmit: (data: MoodSubmit) => void;
  isLoggedIn: boolean;
}) {
  const [feeling, setFeeling] = useState("");
  const [mood, setMood] = useState("");
  const [count, setCount] = useState(10);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  function validate(): FormErrors {
    const next: FormErrors = {};
    if (!feeling.trim()) next.feeling = "Tell us how you're feeling.";
    if (!mood.trim()) next.mood = "Tell us your mood.";
    const c = Number(count);
    if (Number.isNaN(c) || c < MIN_SONGS || c > MAX_SONGS)
      next.count = `Between ${MIN_SONGS} and ${MAX_SONGS}.`;
    return next;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ feeling: true, mood: true, count: true });
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const dna = readDna();
    onSubmit({
      feeling: feeling.trim(),
      mood: mood.trim(),
      count: Number(count),
      dna,
    });
  }

  function blurField(name: string) {
    setTouched((t) => ({ ...t, [name]: true }));
    setErrors(validate());
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full max-w-xl mx-auto rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-5 animate-fade-in"
    >
      <Field
        id="feeling"
        label="How are you feeling right now?"
        hint="A short description of your current state."
        error={touched.feeling ? errors.feeling : undefined}
      >
        <input
          id="feeling"
          type="text"
          value={feeling}
          onChange={(e) => {
            setFeeling(e.target.value);
            if (touched.feeling) setErrors(validate());
          }}
          onBlur={() => blurField("feeling")}
          className={inputClass(!!errors.feeling && touched.feeling)}
          placeholder="e.g. cozy, a little homesick, alive"
          autoComplete="off"
          required
        />
      </Field>

      <Field
        id="mood"
        label="What's your mood like?"
        hint="The vibe you want the playlist to match."
        error={touched.mood ? errors.mood : undefined}
      >
        <input
          id="mood"
          type="text"
          value={mood}
          onChange={(e) => {
            setMood(e.target.value);
            if (touched.mood) setErrors(validate());
          }}
          onBlur={() => blurField("mood")}
          className={inputClass(!!errors.mood && touched.mood)}
          placeholder="e.g. melancholic optimism, Friday-night buzz"
          autoComplete="off"
          required
        />
      </Field>

      <Field
        id="count"
        label="How many songs?"
        hint={`${MIN_SONGS}–${MAX_SONGS} tracks.`}
        error={touched.count ? errors.count : undefined}
      >
        <input
          id="count"
          type="number"
          value={count}
          onChange={(e) => {
            setCount(e.target.value === "" ? 0 : Number(e.target.value));
            if (touched.count) setErrors(validate());
          }}
          onBlur={() => blurField("count")}
          className={`${inputClass(!!errors.count && touched.count)} w-28`}
          min={MIN_SONGS}
          max={MAX_SONGS}
          step={1}
        />
      </Field>

      <button
        type="submit"
        className="w-full rounded-full bg-spotify hover:bg-spotify-dark active:scale-[0.98] text-neutral-950 font-semibold py-3.5 text-base transition-colors shadow-lg shadow-spotify/20 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={!isLoggedIn}
        title={!isLoggedIn ? "Log in with Spotify first" : "Generate playlist"}
      >
        Generate playlist
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium mb-1">
        {label}
      </label>
      <p className="text-xs text-neutral-500 mb-2">{hint}</p>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-400">{error}</p>
      ) : null}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-xl bg-neutral-950 border px-4 py-3 text-base outline-none transition-colors placeholder:text-neutral-600",
    hasError
      ? "border-red-500/70 focus:border-red-400 focus:ring-2 focus:ring-red-500/30"
      : "border-neutral-800 focus:border-spotify focus:ring-2 focus:ring-spotify/30",
  ].join(" ");
}
