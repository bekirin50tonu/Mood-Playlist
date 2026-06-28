import { NextResponse } from "next/server";
import {
  buildAuthUrl,
  env,
  generatePkce,
  generateRandomString,
  SPOTIFY_REDIRECT_URI,
} from "@/lib/spotify";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = generateRandomString(16);
  const { verifier, challenge } = await generatePkce();

  const url = buildAuthUrl({
    clientId: env("SPOTIFY_CLIENT_ID"),
    redirectUri: SPOTIFY_REDIRECT_URI,
    challenge,
    state,
  });

  const res = NextResponse.redirect(url);
  // Store verifier + state in short-lived cookies for the callback step.
  res.cookies.set("pkce_verifier", verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  res.cookies.set("auth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
