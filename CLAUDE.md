# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
Mood Playlist — a Next.js 16 (App Router) app that generates Spotify playlists from a user's current feeling + mood, blended with their "musical DNA" (derived from recent listening) via a Gemini model. Spotify login uses OAuth 2.0 PKCE.

## Commands
- `pnpm dev` — start dev server (http://localhost:3000)
- `pnpm build` — production build
- `pnpm start` — run production build
- `pnpm lint` — eslint

## Architecture

### Auth flow (PKCE — no client secret in browser)
1. `src/app/api/auth/login/route.ts` — generates PKCE verifier + challenge, stores them in short-lived httpOnly cookies (`pkce_verifier`, `auth_state`), redirects to Spotify authorize endpoint.
2. Spotify redirects back to `/api/auth/callback/route.ts`. The route validates state, exchanges the auth code for tokens (access + refresh), fetches the user profile, then writes a signed HM session cookie (`spotify_session`) via `setSession` and clears the PKCE cookies.
3. `src/lib/session.ts` — session storage. Keys: `SESSION_SECRET` (set in `.env.local`). `withValidToken()` is the guarded accessor for server Spotify calls — it auto-refreshes if the token is within 60s of expiry, otherwise throws.
4. `src/app/api/auth/me/route.ts` — returns `{ authenticated, user }` for the client's initial phase check.
5. `src/app/api/auth/logout/route.ts` — clears the session cookie.

### Playlist generation
- `src/app/api/playlist/generate/route.ts` — POST. Body: `{ feeling, mood, count, dna? }`. Calls `pickSeeds` (Gemini) → `withValidToken(getRecommendations)` → `withValidToken(createPlaylist + addTracksToPlaylist)` (best-effort — failure returns `createError` not a hard error).
- `src/lib/gemini.ts` — `pickSeeds()` calls Gemini 3.5 Flash Lite, asks for JSON back (artists, genres, tracks, target audio features, playlist label). Strips code fences if present, clamps numeric ranges.

### Musical DNA
- `src/lib/dna.ts` — pure functions for computing DNA (averages of audio features + top 5 genres). Client persists result to localStorage under `spotify_musical_dna`.
- `src/app/api/dna/route.ts` — GET. Uses `withValidToken` to read recently-played tracks + audio features + artist genres, returns computed DNA. Note: this rounds-trips through the server; the client persists to localStorage itself after a successful generate (`page.tsx:100`).

### Frontend phase machine
- `page.tsx` is a client component with a `phase` state: `loading-auth → logged-out → ready → generating → result | error`. Initial fetch to `/api/auth/me` sets the starting phase. `authGeneration` counter is a cache-buster trigger re-fetches without adding noise to the URL.

## Env vars (see `.env.example`)
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` — Spotify app credentials (developer.spotify.com/dashboard).
- `SPOTIFY_REDIRECT_URI` — must match the Spotify app's registered redirect URI exactly.
- `NEXT_PUBLIC_REDIRECT_BASE` — the public base used to bounce the browser back from `/api/auth/callback` (set to `http://localhost:3000` in dev; must be the LAN host if you want to test from other devices on the network, e.g. `http://192.168.1.106`).
- `GEMINI_API_KEY` — from Google AI Studio.
- `SESSION_SECRET` — random 32+ char string used to HMAC-sign the session cookie.

## Known gotcha: redirect looping
The callback route redirects to `${NEXT_PUBLIC_REDIRECT_BASE}/`. If `NEXT_PUBLIC_REDIRECT_BASE` doesn't match the host the user's browser is actually on (e.g. it's set to `localhost` but the user opened `http://192.168.1.106`), Spotify's `redirect_uri` mismatch checks on the token exchange or a mismatch between request host and cookie origin can cause repeated redirects ("too many times"). Fix: make sure `NEXT_PUBLIC_REDIRECT_URI` and the URL in the user's address bar use the same host/scheme, and that both are registered in the Spotify dashboard's redirect URIs list.

## Notes
- Dependency manager is pnpm (see `pnpm-lock.yaml`, `pnpm-workspace.yaml`).
- next.config.ts enables `reactStrictMode` and sets `allowedDevOrigins` — if you serve on a non-localhost LAN host, add that host here too or the dev server will block its own requests.
- No test suite currently exists.
