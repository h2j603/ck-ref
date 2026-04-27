import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ARCHIVE_AUTH_COOKIE, ARCHIVE_AUTH_MAX_AGE } from "@/lib/auth";
import { DISCORD_TRUST_COOKIE } from "@/lib/discordTrust";
import { isProfileKey } from "@/lib/profiles";

// Auth shortcut for users arriving via a Discord deep link. The proxy has
// already verified the signed ?d=<token> on the way in and set the
// discord_trust cookie. Here we just trade that for the regular auth
// cookie, scoped to the picked profile — no password required.
export async function POST(request: Request) {
  let payload: { key?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!isProfileKey(payload.key)) {
    return NextResponse.json(
      { error: "프로필을 선택해주세요." },
      { status: 400 },
    );
  }

  const store = await cookies();
  const trust = store.get(DISCORD_TRUST_COOKIE)?.value;
  if (trust !== "1") {
    return NextResponse.json(
      { error: "디스코드 링크를 통한 접근만 가능합니다." },
      { status: 403 },
    );
  }

  store.set(ARCHIVE_AUTH_COOKIE, payload.key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ARCHIVE_AUTH_MAX_AGE,
  });

  return NextResponse.json({ ok: true });
}
