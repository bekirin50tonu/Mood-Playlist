"use client";

import { useCallback, useEffect, useState } from "react";
import { MoodForm, type MoodSubmit } from "@/components/MoodForm";
import { LoginButton } from "@/components/LoginButton";
import { MusicalDnaCard } from "@/components/MusicalDnaCard";
import { PlaylistResult, type GeneratedTrack } from "@/components/PlaylistResult";
import { Loader } from "@/components/Loader";

type User = { name: string | null; image: string | null; url: string };
type Phase = "loading-auth" | "logged-out" | "ready" | "generating" | "result" | "error";

type AppState = {
  phase: Phase;
  user: User | null;
  // Result / generation params:
  feeling?: string;
  mood?: string;
  count?: number;
  tracks?: GeneratedTrack[];
  playlistUrl?: string | null;
  createError?: string | null;
  message?: string;
  /** Incremented to force re-fetches / resets without URL param noise. */
  authGeneration: number;
};

export default function Home() {
  const [state, setState] = useState<AppState>({
    phase: "loading-auth",
    user: null,
    authGeneration: 0,
  });
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/auth/me", { cache: "no-store", signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setState({
            phase: "ready",
            user: {
              name: data.user.displayName,
              image: data.user.image,
              url: data.user.profileUrl,
            },
            authGeneration: 1,
          });
        } else {
          setState({ phase: "logged-out", user: null, authGeneration: 1 });
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ phase: "logged-out", user: null, authGeneration: 1 });
      });
    return () => ctrl.abort();
  }, []);

  const handleGenerate = useCallback(async (data: MoodSubmit) => {
    setState((prev) => ({
      phase: "generating",
      user: prev.user,
      feeling: data.feeling,
      mood: data.mood,
      count: data.count,
      authGeneration: prev.authGeneration,
    }));
    try {
      const res = await fetch("/api/playlist/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeling: data.feeling,
          mood: data.mood,
          count: data.count,
          dna: data.dna,
        }),
      });
      const out = await res.json();
      if (!res.ok) {
        setState((prev) => ({
          phase: "error",
          user: prev.user,
          message: out.error || `Request failed (${res.status})`,
          authGeneration: prev.authGeneration,
        }));
        return;
      }
      if (data.dna) {
        try {
          window.localStorage.setItem(
            "spotify_musical_dna",
            JSON.stringify(data.dna),
          );
        } catch {
          /* ignore storage errors */
        }
      }
      setState((prev) => ({
        phase: "result",
        user: prev.user,
        feeling: data.feeling,
        mood: data.mood,
        tracks: out.tracks,
        playlistUrl: out.playlist?.external_urls?.spotify ?? null,
        createError: out.createError ?? null,
        authGeneration: prev.authGeneration,
      }));
    } catch (err) {
      setState((prev) => ({
        phase: "error",
        user: prev.user,
        message: (err as Error).message,
        authGeneration: prev.authGeneration,
      }));
    }
  }, []);

  const handleReset = useCallback(() => {
    setState((prev) => {
      if (prev.phase === "result" || prev.phase === "error") {
        return { phase: "ready", user: prev.user, authGeneration: prev.authGeneration };
      }
      return prev;
    });
  }, []);

  return (
    <main className="flex-1 flex flex-col">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12 flex flex-col gap-8 flex-1">
        <Header user={state.user} />

        {state.phase === "loading-auth" && <Loader message="Checking session…" />}

        {state.phase === "logged-out" && (
          <>
            <Hero />
            <div className="flex flex-col items-center gap-3">
              <LoginButton />
              <p className="text-xs text-neutral-500 text-center max-w-sm">
                We&apos;ll read your recent listening to understand your musical DNA,
                then use Gemini + Spotify to build a playlist that matches your mood.
              </p>
            </div>
            <InfoNote
              label="Log in to generate playlists."
              hint="Your data stays on this device and your Spotify account."
            />
          </>
        )}

        {state.phase === "generating" && (
          <>
            <GeneratingSummary
              feeling={state.feeling ?? ""}
              mood={state.mood ?? ""}
              count={state.count ?? 0}
            />
            <Loader message="Gemini is curating seeds…" />
          </>
        )}

        {(state.phase === "ready" || state.phase === "logged-out") && <MusicalDnaCard />}

        {(state.phase === "ready" || state.phase === "result" || state.phase === "error") && (
          <>
            {state.phase === "error" && (
              <ErrorBanner message={state.message ?? "Something went wrong."} onDismiss={handleReset} />
            )}
            {(state.phase === "ready" || state.phase === "result") && (
              <MoodForm onSubmit={handleGenerate} isLoggedIn={true} />
            )}
          </>
        )}

        {state.phase === "result" && (
          <PlaylistResult
            tracks={state.tracks ?? []}
            playlistUrl={state.playlistUrl ?? null}
            createError={state.createError ?? null}
            feeling={state.feeling ?? ""}
            mood={state.mood ?? ""}
            onReset={handleReset}
          />
        )}
      </div>

      <Footer />
    </main>
  );
}

function Header({ user }: { user: User | null }) {
  if (!user) {
    return (
      <header className="flex items-center justify-between">
        <Logo />
      </header>
    );
  }
  return (
    <header className="flex items-center justify-between">
      <Logo />
      <form action="/api/auth/logout" method="post" className="flex items-center gap-2">
        <a
          href={user.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt={user.name ?? "profile"} className="h-6 w-6 rounded-full object-cover" />
          ) : null}
          <span>{user.name ?? "Spotify user"}</span>
        </a>
        <button
          type="submit"
          className="rounded-full border border-neutral-700 hover:border-neutral-500 px-3 py-1 text-xs text-neutral-300"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-spotify text-neutral-950 font-bold"
      >
        ♪
      </span>
      <h1 className="text-lg font-semibold tracking-tight">Mood Playlist</h1>
    </div>
  );
}

function Hero() {
  return (
    <section className="text-center space-y-3 py-4 animate-fade-in">
      <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
        A playlist for how you feel, <span className="text-spotify">right now</span>.
      </h2>
      <p className="text-neutral-400 max-w-xl mx-auto">
        Tell us your feeling and your mood, and we&apos;ll build you a Spotify playlist
        that sounds like your taste bent toward your vibe.
      </p>
    </section>
  );
}

function GeneratingSummary({ feeling, mood, count }: { feeling: string; mood: string; count: number }) {
  return (
    <p className="text-center text-sm text-neutral-400">
      Building <span className="text-neutral-200 font-medium">{count} songs</span> for feeling{" "}
      <span className="text-neutral-200 font-medium">&ldquo;{feeling}&rdquo;</span> and mood{" "}
      <span className="text-neutral-200 font-medium">&ldquo;{mood}&rdquo;</span>…
    </p>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 flex items-start gap-3 animate-fade-in"
    >
      <span className="text-red-400 mt-0.5">!</span>
      <p className="flex-1 text-sm text-red-200">{message}</p>
      <button
        onClick={onDismiss}
        className="text-xs text-red-300 hover:text-red-100 underline-offset-4 hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}

function InfoNote({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-300">
      <p>{label}</p>
      {hint ? <p className="text-xs text-neutral-500 mt-1">{hint}</p> : null}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-900 py-5 text-center text-xs text-neutral-600">
      Built with Spotify + Gemini + Next.js. Your tokens live in an httpOnly cookie and
      are never exposed to the browser.
    </footer>
  );
}
