import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import { isProfileKey } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/types";

const PAGE_LIMIT = 30;

async function recipient(): Promise<string | null> {
  const store = await cookies();
  const key = store.get(ARCHIVE_AUTH_COOKIE)?.value;
  return key && isProfileKey(key) ? key : null;
}

export async function GET(request: Request) {
  const me = await recipient();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";

  const supabase = await createClient();
  let q = supabase
    .from("notifications")
    .select("*")
    .eq("recipient", me)
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT);
  if (unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Unread count is cheap at this scale and saves the client a second call.
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient", me)
    .is("read_at", null);

  return NextResponse.json({
    items: (data ?? []) as Notification[],
    unreadCount: count ?? 0,
  });
}

// Mark notifications as read. Accepts either { ids: string[] } to mark a
// specific list, or { all: true } to mark every unread one for the recipient.
export async function POST(request: Request) {
  const me = await recipient();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { ids?: unknown; all?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  if (payload.all === true) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("recipient", me)
      .is("read_at", null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("recipient", me)
    .in("id", ids)
    .is("read_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
