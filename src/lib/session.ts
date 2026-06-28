// Server-side auth session stored as a signed httpOnly cookie.
//
// We don't run a database — the access + refresh tokens live in a single
// cookie that is signed with HMAC using SESSION_SECRET. The browser can't
// tamper with it, and httpOnly keeps JS (and XSS) away from the tokens.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { setCurrentToken } from "./spotify";

export const SESSION_COOKIE = "spotify_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type SessionData = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms when access token expires
  user: {
    id: string;
    displayName: string | null;
    email: string | null;
    image: string | null;
    product: string | null;
    profileUrl: string;
  };
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16)
    throw new Error(
      "SESSION_SECRET must be set to a random string of 16+ characters",
    );
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

function serialize(data: SessionData): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

function deserialize<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function encode(session: SessionData): string {
  const payload = serialize(session);
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function decode(token: string): SessionData | null {
  const idx = token.lastIndexOf(".");
  if (idx === -1) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return deserialize<SessionData>(payload);
}

export async function setSession(session: SessionData): Promise<void> {
  setCurrentToken(session.accessToken);
  const store = await cookies();
  store.set(SESSION_COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionData | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decode(raw);
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function withValidToken<T>(
  fn: (accessToken: string, session: SessionData) => Promise<T>,
): Promise<T> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  // Install the refresher so the axios interceptor can refresh on 401/403
  // without having to call withValidToken again.
  const spotify = await import("./spotify");
  spotify.setTokenRefresher(async () => {
    const s = await getSession();
    if (!s?.refreshToken) throw new Error("Session expired — no refresh token");
    const refreshed = await spotify.refreshToken({
      refreshToken: s.refreshToken,
      clientId: spotify.env("SPOTIFY_CLIENT_ID"),
      clientSecret: spotify.env("SPOTIFY_CLIENT_SECRET"),
    });
    const next: SessionData = {
      ...s,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? s.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };
    await setSession(next);
    return next.accessToken;
  });

  const now = Date.now();
  // Refresh if expired or about to expire within 60s.
  if (session.expiresAt - 60_000 <= now) {
    const { refreshToken } = session;
    if (!refreshToken) {
      await clearSession();
      throw new Error("Session expired — no refresh token");
    }
    const refreshed = await spotify.refreshToken({
      refreshToken,
      clientId: spotify.env("SPOTIFY_CLIENT_ID"),
      clientSecret: spotify.env("SPOTIFY_CLIENT_SECRET"),
    });
    const next: SessionData = {
      ...session,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? refreshToken,
      expiresAt: now + refreshed.expires_in * 1000,
    };
    await setSession(next);
    return fn(next.accessToken, next);
  }
  return fn(session.accessToken, session);
}
