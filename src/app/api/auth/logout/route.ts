import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSession();
  const redirectBase = process.env.NEXT_PUBLIC_REDIRECT_BASE ?? "/";
  return NextResponse.redirect(redirectBase, 303);
}
