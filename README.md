# Mood Playlist

A Next.js (App Router) web app that builds a Spotify playlist for how you
feel *right now*. You describe your feeling + mood, Gemini picks seed
artists/genres/tracks from your musical taste, and the app searches
Spotify for matching songs and (optionally) saves them to a playlist in
your Spotify account.

Built with **Next.js 16** (App Router + Turbopack), **Spotify Web API
(PKCE OAuth)**, and **Gemini 3.1 Flash Lite**. Your Spotify access +
refresh tokens live in a signed, httpOnly cookie and are never exposed to
the browser.

---

## How it works

### Auth (PKCE — no client secret in the browser)

1. `GET /api/auth/login` generates a PKCE verifier + challenge, stores
   them in short-lived httpOnly cookies, and redirects to Spotify's
   authorize screen.
2. Spotify redirects back to `/api/auth/callback`. The route validates
   the state, exchanges the code for access + refresh tokens, fetches
   your Spotify profile, and writes a signed-HMAC session cookie
   (`spotify_session`) via `setSession`.
3. `GET /api/auth/me` returns `{ authenticated, user }` so the client can
   detect an existing session on load. `POST /api/auth/logout` clears the
   session.

### Musical DNA

Your "musical DNA" is derived from your top artists, top tracks, and
recently-played tracks — the endpoints still available to new Spotify
apps after the November 2024 API restriction. The app computes:

- **Top genres** (ranked by frequency across your artists)
- **Top tracks** (with album art)
- **Top artists** (with their genres)
- A human-readable **taste summary** (e.g. "You love metal and pop")

The DNA is persisted in the browser's `localStorage` under
`spotify_musical_dna` so it survives reloads, and it's sent along with
generation requests so Gemini can contextualize seed picks to your taste.

### Playlist generation

1. `POST /api/playlist/generate` with `{ feeling, mood, count, dna? }`.
2. Gemini returns seed artists, seed genres, seed tracks, and a playlist
   title — informed by your DNA.
3. The app searches Spotify (`GET /v1/search`) with a query built from
   your feeling + mood + top genre, dedupes the results, and returns the
   track list.
4. Best-effort: if you're logged in, the route creates a playlist in
   your Spotify account and adds the tracks. If this fails (missing
   scopes, etc.) the tracks are still returned to the client.

Input is validated with **Zod** schemas in `src/lib/schemas.ts`.

### Frontend

The client (`src/app/page.tsx`) is a small phase machine:

```
loading-auth → logged-out → ready → generating → result | error
```

- `/api/auth/me` decides the starting phase on mount.
- `MoodForm` collects feeling/mood/count.
- `MusicalDnaCard` computes and displays your DNA (recalculable from
  Spotify on click).
- `PlaylistResult` renders the track list with album art and Spotify
  links, with a "Generate another" reset.

Service-worker registration is gated to production only — in dev,
Turbopack handles HMR + cache-busting and the SW ships stale shells.

---

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, React strict mode) |
| Language | TypeScript (strict) |
| Package manager | pnpm |
| Auth | Spotify OAuth 2.0 PKCE (no client secret in the browser) |
| Session | Signed httpOnly cookie (HMAC-SHA256, `SESSION_SECRET`) |
| LLM | Gemini 3.1 Flash Lite (via `@google/genai`) |
| API client | Axios with request-interceptor token attach + response-interceptor auto-refresh on 401 |
| Validation | Zod 4 |
| UI | Tailwind CSS v4 |
| PWA | Manifest + offline-first service worker |

```
src/
  app/
    page.tsx                       # client phase machine + UI composition
    layout.tsx                     # root layout, dark theme, SW register
    globals.css                    # Tailwind entry + animations
    api/
      auth/                        # login, callback, me, logout
      dna/                         # GET — compute musical DNA
      playlist/generate/           # POST — Gemini seeds → search → tracks
  components/                      # MoodForm, MusicalDnaCard, PlaylistResult, etc.
  lib/
    spotify.ts                     # PKCE, axios client, top/search fetchers
    session.ts                     # cookie session + withValidToken guard
    gemini.ts                      # pickSeeds prompt
    dna.ts                         # DNA computation + read/write to localStorage
    schemas.ts                     # Zod schemas for all requests + Gemini output
```

---

## Getting started

### Prerequisites

- Node.js 20+
- pnpm
- A **Spotify Developer app** (developer.spotify.com/dashboard) with
  redirect URI `http://localhost:3000/api/auth/callback`
- A **Gemini API key** (aistudio.google.com/apikey)

### Setup

```bash
git clone git@github.com:bekirin50tonu/Mood-Playlist.git
cd Mood-Playlist
pnpm install
cp .env.example .env.local
```

### Configure environment

Edit `.env.local` with real values:

```ini
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
GEMINI_API_KEY=your_gemini_api_key
SESSION_SECRET=random-32-char-string

# Set to your LAN host if testing from another device on the network.
NEXT_PUBLIC_REDIRECT_BASE=http://localhost:3000
```

> The redirect URI must match the Spotify app's registered URI *exactly*,
> including host and scheme.

### Run

```bash
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm start    # run the production build
pnpm lint     # eslint
```

Then open <http://localhost:3000>, log in with Spotify, click
**Recalculate** to compute your musical DNA, then describe a feeling +
mood and hit **Generate playlist**.

---

## Notes & gotchas

**Redirect looping.** If the host in your address bar doesn't match
`SPOTIFY_REDIRECT_URI` and `NEXT_PUBLIC_REDIRECT_BASE` (e.g. one is
`localhost` and the other is a LAN IP), the app can loop on redirects.
Make sure all three agree on host + scheme, and that the exact redirect
URI is registered in your Spotify dashboard.

**Spotify API restrictions (November 2024).** New Spotify apps can no
longer access `/audio-features` or `/v1/recommendations`. This app was
rebuilt around available endpoints (`/me/top/artists`,
`/me/top/tracks`, `/recently-played`, `/artists`, `/v1/search`). Audio
features are no longer part of the musical DNA.

**Server-side Spotify calls.** Token exchange, profile reads, playlist
writes, top/track fetches, and search all happen server-side because
they require the client secret (or a valid server-held token). The
browser only touches routes under `/api/*`.

**No tests yet.** There is no test suite.

---

## License

MIT.
