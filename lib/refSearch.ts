"use client";

import type { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

// Client-side counterpart to lib/queries.ts:searchRefIds. Same dimensions
// (title, tags, ocr_text, designer name, note body / pros / cons) so the
// "ref에서" picker in the positioning map dialog matches what users see
// in the main /ref search bar. We keep the server version because RSC
// pages still need the heavy joins server-side; this one accepts an
// already-created supabase client so client components can reuse it.
//
// Performance: same-table predicates are coalesced via .or() so the search
// fires 3 round-trips (refs, designers, notes) instead of 7. Tags use the
// array-contains (cs) operator which lives in the same .or() string on
// the refs query.
export async function searchRefIdsClient(
  supabase: SupabaseClient,
  q: string,
): Promise<Set<string>> {
  const trimmed = q.trim();
  if (!trimmed) return new Set();
  const like = `%${trimmed.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  // `.or()` takes a comma-separated list of field.op.value clauses. We
  // skip combining the array-contains (tags) into the .or() since the
  // {value} syntax inside or() trips on commas in user input — keep it
  // as a tiny separate query.
  const refsOr = `title.ilike.${like},ocr_text.ilike.${like}`;
  const notesOr = `body.ilike.${like},pros.ilike.${like},cons.ilike.${like}`;

  const [refsRes, tagsRes, designerRes, notesRes] = await Promise.all([
    supabase
      .from("refs")
      .select("id")
      .eq("board_only", false)
      .or(refsOr)
      .limit(200),
    supabase
      .from("refs")
      .select("id")
      .eq("board_only", false)
      .contains("tags", [trimmed])
      .limit(200),
    supabase
      .from("designers")
      .select("ref_designers(ref_id)")
      .ilike("name", like)
      .limit(50),
    supabase.from("notes").select("ref_id").or(notesOr).limit(200),
  ]);

  const ids = new Set<string>();
  for (const r of refsRes.data ?? []) ids.add((r as { id: string }).id);
  for (const r of tagsRes.data ?? []) ids.add((r as { id: string }).id);
  for (const d of (designerRes.data ?? []) as {
    ref_designers: { ref_id: string }[] | null;
  }[]) {
    for (const rd of d.ref_designers ?? []) ids.add(rd.ref_id);
  }
  for (const n of notesRes.data ?? []) {
    const ref_id = (n as { ref_id: string | null }).ref_id;
    if (ref_id) ids.add(ref_id);
  }
  return ids;
}
