"use client";

import type { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

// Client-side counterpart to lib/queries.ts:searchRefIds. Same dimensions
// (title, tags, ocr_text, designer name, note body / pros / cons) so the
// "ref에서" picker in the positioning map dialog matches what users see
// in the main /ref search bar. We keep the server version because RSC
// pages still need the heavy joins server-side; this one accepts an
// already-created supabase client so client components can reuse it.
export async function searchRefIdsClient(
  supabase: SupabaseClient,
  q: string,
): Promise<Set<string>> {
  const trimmed = q.trim();
  if (!trimmed) return new Set();
  const like = `%${trimmed.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const [titleRes, tagRes, ocrRes, designerRes, bodyRes, prosRes, consRes] =
    await Promise.all([
      supabase.from("refs").select("id").ilike("title", like).limit(500),
      supabase.from("refs").select("id").contains("tags", [trimmed]).limit(500),
      supabase.from("refs").select("id").ilike("ocr_text", like).limit(500),
      supabase
        .from("designers")
        .select("ref_designers(ref_id)")
        .ilike("name", like)
        .limit(50),
      supabase.from("notes").select("ref_id").ilike("body", like).limit(500),
      supabase.from("notes").select("ref_id").ilike("pros", like).limit(500),
      supabase.from("notes").select("ref_id").ilike("cons", like).limit(500),
    ]);

  const ids = new Set<string>();
  for (const r of titleRes.data ?? []) ids.add((r as { id: string }).id);
  for (const r of tagRes.data ?? []) ids.add((r as { id: string }).id);
  for (const r of ocrRes.data ?? []) ids.add((r as { id: string }).id);
  for (const d of (designerRes.data ?? []) as {
    ref_designers: { ref_id: string }[] | null;
  }[]) {
    for (const rd of d.ref_designers ?? []) ids.add(rd.ref_id);
  }
  for (const n of bodyRes.data ?? []) {
    const ref_id = (n as { ref_id: string | null }).ref_id;
    if (ref_id) ids.add(ref_id);
  }
  for (const n of prosRes.data ?? []) {
    const ref_id = (n as { ref_id: string | null }).ref_id;
    if (ref_id) ids.add(ref_id);
  }
  for (const n of consRes.data ?? []) {
    const ref_id = (n as { ref_id: string | null }).ref_id;
    if (ref_id) ids.add(ref_id);
  }
  return ids;
}
