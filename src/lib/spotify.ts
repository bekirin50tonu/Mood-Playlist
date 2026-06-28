// Spotify API helpers: PKCE auth URL, token exchange, and data fetching.
// Token exchange + playlist writes happen server-side (route handlers) because
// they require the client secret. The browser only generates the PKCE
// verifier/challenge and stores the verifier for the callback exchange.
//
// All API calls go through an axios instance whose request interceptor attaches
// the current access token and whose response interceptor auto-refreshes on
// 401/403 and retries the original request once.

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios";

export const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
export const SPOTIFY_REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ?? "http://localhost:3000/api/auth/callback";

export const SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-private",
  "user-read-email",
  "user-read-recently-played",
  "user-top-read",
  "playlist-read-private",
].join(" ");

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function generateRandomString(length = 64): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

export async function generatePkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = generateRandomString(64);
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

export function base64UrlEncode(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildAuthUrl(args: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    response_type: "code",
    redirect_uri: args.redirectUri,
    scope: SCOPES,
    state: args.state,
    code_challenge_method: "S256",
    code_challenge: args.challenge,
    show_dialog: "false",
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export type SpotifyTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  images: { url: string }[];
  product: string | null;
  external_urls: { spotify: string };
};

export type SpotifyArtist = {
  id: string;
  name: string;
  genres: string[];
  images: { url: string; width: number; height: number }[];
  external_urls: { spotify: string };
};

// A track from any source we use for results (search / top / recently-played).
// Structurally matches Spotify's "TrackObject" for the fields we consume, so
// the playlist UI can treat every source uniformly.
export type TrackCandidate = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  external_urls: { spotify: string };
  preview_url: string | null;
  duration_ms: number;
};

// Re-export the dna summary shapes so the rest of the app imports them from a
// single place without circular coupling.
export type { TrackSummary, ArtistSummary } from "./dna";

// ── axios instance + interceptor plumbing ──────────────────────────────────

type TokenRefresher = () => Promise<string>;

let client: AxiosInstance | null = null;
let refreshFn: TokenRefresher | null = null;
// Tracks in-flight refresh so concurrent 401s share a single refresh call.
let refreshInFlight: Promise<string> | null = null;

function getTokenRefresher(): TokenRefresher {
  if (!refreshFn) {
    // Fall back to env-based refresh if no session hook has been installed.
    refreshFn = async () => {
      throw new Error("No token refresher installed — re-authenticate");
    };
  }
  return refreshFn;
}

function doRefresh(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  const p = getTokenRefresher()().finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = p;
  return p;
}

function createClient(): AxiosInstance {
  const inst = axios.create({
    baseURL: SPOTIFY_API_BASE,
    headers: { "Content-Type": "application/json" },
  });

  // Attach the current access token to every request.
  inst.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
    const token = currentToken;
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
    return cfg;
  });

  // Only 401 (unauthorized) means the token expired and refresh can fix it.
  // 403 (forbidden) is a permission/market/dev-mode-allowlist issue that
  // refreshing cannot resolve — treat it as a hard error immediately.
  inst.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const cfg = error.config;
      const status = error.response?.status;
      if (
        cfg &&
        status === 401 &&
        !(cfg as { _retry?: boolean })._retry
      ) {
        (cfg as { _retry?: boolean })._retry = true;
        const newToken = await doRefresh();
        cfg.headers.Authorization = `Bearer ${newToken}`;
        return inst(cfg);
      }
      const path = cfg ? `${cfg.baseURL ?? ""}${cfg.url ?? ""}` : "";
      const body = error.response?.data;
      const detail =
        body && typeof body === "object" && "error" in body
          ? (body as { error?: { message?: string; status?: number } }).error
            ?.message ?? JSON.stringify(body)
          : typeof body === "string"
            ? body
            : error.message;
      const e = new Error(
        `Spotify API error (${status}) on ${path}: ${detail}`,
      ) as Error & { status?: number };
      e.status = status;
      throw e;
    },
  );

  return inst;
}

// Lazily-built singleton. We can't build it at module load because the token
// refresher isn't installed until the session layer is wired up.
export function getClient(): AxiosInstance {
  if (!client) client = createClient();
  return client;
}

// Session layer calls this once at startup to install the refresher.
export function setTokenRefresher(fn: TokenRefresher): void {
  refreshFn = fn;
}

// Current access token held in memory; updated by withValidToken / setSession.
let currentToken: string | null = null;
export function setCurrentToken(token: string | null): void {
  currentToken = token;
}

// ── token exchange ─────────────────────────────────────────────────────────

export async function exchangeToken(args: {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: args.clientId,
    code_verifier: args.verifier,
  });
  const res = await axios.post<SpotifyTokenResponse>(SPOTIFY_TOKEN_URL, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${args.clientId}:${args.clientSecret}`)}`,
    },
  });
  return res.data;
}

export async function refreshToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<SpotifyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
    client_id: args.clientId,
  });
  const res = await axios.post<SpotifyTokenResponse>(SPOTIFY_TOKEN_URL, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${args.clientId}:${args.clientSecret}`)}`,
    },
  });
  return res.data;
}

// ── data fetchers ───────────────────────────────────────────────────────────

export type RecentlyPlayedResponse = {
  items: {
    track: {
      id: string;
      name: string;
      duration_ms: number;
      artists: { id: string; name: string }[];
      album: {
        name: string;
        images: { url: string; width: number; height: number }[];
      };
      external_urls: { spotify: string };
      preview_url: string | null;
    };
    played_at: string;
  }[];
};

export function getProfile(): Promise<SpotifyProfile> {
  return getClient()
    .get<SpotifyProfile>("/me")
    .then((r) => r.data);
}

export function getRecentlyPlayed(
  limit = 50,
): Promise<RecentlyPlayedResponse> {
  return getClient()
    .get<RecentlyPlayedResponse>(`/me/player/recently-played`, {
      params: { limit },
    })
    .then((r) => r.data);
}

export function getArtists(
  artistIds: string[],
): Promise<{ artists: SpotifyArtist[] }> {
  const unique = Array.from(new Set(artistIds));
  if (!unique.length) return Promise.resolve({ artists: [] });
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 50)
    chunks.push(unique.slice(i, i + 50));
  return Promise.all(
    chunks.map((chunk) =>
      getClient()
        .get<{ artists: SpotifyArtist[] }>(`/artists`, {
          params: { ids: chunk.join(",") },
        })
        .then((r) => r.data.artists),
    ),
  ).then((arrays) => ({ artists: arrays.flat() }));
}

// ── top artists / tracks (/v1/me/top/*) ──────────────────────────────────────
// These endpoints remain available to new apps (unlike /audio-features and
// /recommendations). We use them as the basis for the user's musical DNA and as
// seed sources for playlist generation.

export type TopTimeRange = "long_term" | "medium_term" | "short_term";

type TopTracksResponse = {
  items: TrackCandidate[];
};

type TopArtistsResponse = {
  items: SpotifyArtist[];
};

export function getTopTracks(
  limit = 10,
  timeRange: TopTimeRange = "medium_term",
): Promise<TrackCandidate[]> {
  return getClient()
    .get<TopTracksResponse>(`/me/top/tracks`, {
      params: { limit, time_range: timeRange },
    })
    .then((r) => r.data.items);
}

export function getTopArtists(
  limit = 10,
  timeRange: TopTimeRange = "medium_term",
): Promise<SpotifyArtist[]> {
  return getClient()
    .get<TopArtistsResponse>(`/me/top/artists`, {
      params: { limit, time_range: timeRange },
    })
    .then((r) => r.data.items);
}

// ── search (/v1/search) ──────────────────────────────────────────────────────
// Replacement for the now-restricted /recommendations endpoint. Returns the
// same TrackCandidate shape the playlist UI already consumes. With a user token
// present, Spotify infers the market from the account, so no market param is
// needed.

type SearchTracksResponse = { tracks: { items: TrackCandidate[] } };

export function searchTracks(
  query: string,
  limit = 20,
): Promise<TrackCandidate[]> {
  return getClient()
    .get<SearchTracksResponse>(`/search`, {
      params: { q: query, type: "track", limit },
    })
    .then((r) => r.data.tracks.items);
}

export function createPlaylist(
  userId: string,
  name: string,
  description: string,
  isPublic = false,
): Promise<{ id: string; external_urls: { spotify: string } }> {
  return getClient()
    .post<{ id: string; external_urls: { spotify: string } }>(
      `/users/${userId}/playlists`,
      { name, description, public: isPublic },
    )
    .then((r) => r.data);
}

export function addTracksToPlaylist(
  playlistId: string,
  uris: string[],
): Promise<void> {
  const chunks: string[][] = [];
  for (let i = 0; i < uris.length; i += 100)
    chunks.push(uris.slice(i, i + 100));
  return Promise.all(
    chunks.map((chunk) =>
      getClient()
        .post(`/playlists/${playlistId}/tracks`, { uris: chunk })
        .then(() => undefined),
    ),
  ).then(() => undefined);
}
