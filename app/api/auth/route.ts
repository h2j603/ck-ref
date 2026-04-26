import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ARCHIVE_AUTH_COOKIE, ARCHIVE_AUTH_MAX_AGE } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isProfileKey } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let payload: { key?: unknown; password?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!isProfileKey(payload.key)) {
    return NextResponse.json({ error: "프로필을 선택해주세요." }, { status: 400 });
  }
  if (typeof payload.password !== "string" || payload.password.length === 0) {
    return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 });
  }
  // No length cap higher than this is meaningful for scrypt; bail early on
  // pathological input to avoid burning CPU on garbage.
  if (payload.password.length > 256) {
    return NextResponse.json({ error: "비밀번호가 너무 깁니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("key, password_hash")
    .eq("key", payload.key)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "프로필이 없습니다." }, { status: 404 });
  }

  const row = data as { key: string; password_hash: string | null };
  const stored = row.password_hash;

  if (!stored) {
    // First-time setup: the password the user just typed becomes the
    // profile's password.
    const hash = hashPassword(payload.password);
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ password_hash: hash, updated_at: new Date().toISOString() })
      .eq("key", payload.key);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  } else if (!verifyPassword(payload.password, stored)) {
    return NextResponse.json(
      { error: "비밀번호가 맞지 않습니다." },
      { status: 401 },
    );
  }

  const store = await cookies();
  store.set(ARCHIVE_AUTH_COOKIE, payload.key, {
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
