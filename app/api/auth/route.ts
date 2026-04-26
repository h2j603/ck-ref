import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ARCHIVE_AUTH_COOKIE, ARCHIVE_AUTH_MAX_AGE } from "@/lib/auth";

export async function POST(request: Request) {
  const expected = process.env.ARCHIVE_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "ARCHIVE_PASSWORD is not configured." },
      { status: 500 },
    );
  }

  let payload: { password?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (typeof payload.password !== "string" || payload.password !== expected) {
    return NextResponse.json(
      { error: "비밀번호가 맞지 않습니다." },
      { status: 401 },
    );
  }

  const store = await cookies();
  store.set(ARCHIVE_AUTH_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ARCHIVE_AUTH_MAX_AGE,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(ARCHIVE_AUTH_COOKIE);
  return NextResponse.json({ ok: true });
}
