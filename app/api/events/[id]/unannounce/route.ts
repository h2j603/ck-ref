import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Toggling announce off via the banner X. The event itself stays in the
// calendar — only the index pin is dropped. RLS on `events` is the
// permissive "anon all" policy used everywhere else in this app, so
// authorization comes from the same shared-password gate as the rest of
// the surface (the proxy redirects unauthenticated visitors).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ announce: false })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
