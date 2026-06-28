import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { exchangeToken, getProfile } from "@/lib/spotify";
import { setSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const redirectBase = process.env.NEXT_PUBLIC_REDIRECT_BASE ?? "";

  // Spotify returned an error (e.g. user denied, server_error).
  if (error) {
    // Single redirect to home — do NOT preserve the error param to avoid loops.
    const res = NextResponse.redirect(`${redirectBase}/`);
    // Clear any stale auth cookies just in case.
    res.cookies.delete("pkce_verifier");
    res.cookies.delete("auth_state");
    return res;
  }

  if (!code) {
    const res = NextResponse.redirect(`${redirectBase}/`);
    res.cookies.delete("pkce_verifier");
    res.cookies.delete("auth_state");
    return res;
  }

  const expectedState = req.cookies.get("auth_state")?.value;
  const verifier = req.cookies.get("pkce_verifier")?.value;

  if (!verifier) {
    const res = NextResponse.redirect(`${redirectBase}/`);
    res.cookies.delete("pkce_verifier");
    res.cookies.delete("auth_state");
    return res;
  }

  if (state && expectedState && state !== expectedState) {
    const res = NextResponse.redirect(`${redirectBase}/`);
    res.cookies.delete("pkce_verifier");
    res.cookies.delete("auth_state");
    return res;
  }

  try {
    const tokenRes = await exchangeToken({
      code,
      verifier,
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI!,
    });

    const profile = await getProfile();
    const now = Date.now();

    await setSession({
      accessToken: tokenRes.access_token,
      refreshToken: tokenRes.refresh_token,
      expiresAt: now + tokenRes.expires_in * 1000,
      user: {
        id: profile.id,
        displayName: profile.display_name ?? null,
        email: profile.email ?? null,
        image: profile.images?.[0]?.url ?? null,
        product: profile.product ?? null,
        profileUrl:
          profile.external_urls?.spotify ??
          `https://open.spotify.com/user/${profile.id}`,
      },
    });

    // Success — redirect to home. The page will detect the session via /api/auth/me.
    const res = NextResponse.redirect(`${redirectBase}/`);
    res.cookies.delete("pkce_verifier");
    res.cookies.delete("auth_state");
    return res;
  } catch (err) {
    // Token exchange failed — redirect to home, let the client show a toast.
    console.error("callback token exchange failed:", err);
    const res = NextResponse.redirect(`${redirectBase}/`);
    res.cookies.delete("pkce_verifier");
    res.cookies.delete("auth_state");
    // Set a short-lived flag the client can pick up to show a notice.
    res.cookies.set("auth_failed", "1", {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30,
    });
    return res;
  }
}
