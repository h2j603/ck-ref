import { NextResponse } from "next/server";

import { isProfileKey } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";

// Duration picker on the composer maps to one of these. Keeping the set
// narrow keeps the UI a 4-button row instead of a free-form input.
const DURATION_HOURS = {
  "1h": 1,
  "6h": 6,
  "1d": 24,
  "1w": 24 * 7,
} as const;

type Duration = keyof typeof DURATION_HOURS;

function isDuration(v: unknown): v is Duration {
  return typeof v === "string" && v in DURATION_HOURS;
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const body =
    payload && typeof payload === "object" && "body" in payload
      ? String((payload as { body: unknown }).body ?? "").trim()
      : "";
  const author =
    payload && typeof payload === "object" && "author" in payload
      ? String((payload as { author: unknown }).author ?? "")
      : "";
  const duration =
    payload && typeof payload === "object" && "duration" in payload
      ? (payload as { duration: unknown }).duration
      : null;
  if (!body) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  if (!isProfileKey(author)) {
    return NextResponse.json({ error: "unknown author" }, { status: 400 });
  }
  if (!isDuration(duration)) {
    return NextResponse.json({ error: "bad duration" }, { status: 400 });
  }
  const expiresAt = new Date(
    Date.now() + DURATION_HOURS[duration] * 60 * 60 * 1000,
  ).toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({ body, created_by: author, expires_at: expiresAt })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const author = url.searchParams.get("author");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!author || !isProfileKey(author)) {
    return NextResponse.json({ error: "unknown author" }, { status: 400 });
  }
  const supabase = await createClient();
  // Authors can only retract their own. The shared-password trust model
  // means this is honor-system, but the constraint still keeps accidents
  // (wrong-id deletes) from blowing away other people's announcements.
  const { error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", id)
    .eq("created_by", author);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
