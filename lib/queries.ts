import "server-only";

import { bucketHueRanges, type HueBucket } from "@/lib/color";
import {
  FALLBACK_PROFILES,
  PROFILE_KEYS,
  type Profile,
} from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import type {
  Designer,
  Note,
  Ref,
  RefWithDesigners,
} from "@/lib/types";

type DesignerLite = Pick<Designer, "id" | "slug" | "name">;
type RefRow = Ref & {
  ref_designers?: { designer: DesignerLite | DesignerLite[] | null }[];
};

const REF_COLUMNS = `
  id, title, year, source_url,
  image_path, image_width, image_height,
  genre, medium, languages, tags,
  color_hex, color_hue,
  notes_count, created_at, created_by,
  ref_designers ( designer:designers(id, slug, name) )
`;

function flatten(rows: RefRow[] | null | undefined): RefWithDesigners[] {
  if (!rows) return [];
  return rows.map(({ ref_designers, ...rest }) => {
    const designers: DesignerLite[] = [];
    for (const rd of ref_designers ?? []) {
      const d = rd.designer;
      if (!d) continue;
      if (Array.isArray(d)) designers.push(...d);
      else designers.push(d);
    }
    return { ...rest, designers };
  });
}

export type RefFilter = {
  genre?: string;
  medium?: string;
  language?: string;
  tags?: string[];
  designerId?: string;
  hue?: HueBucket;
};

export async function fetchRefs(filter: RefFilter = {}, limit = 200) {
  const supabase = await createClient();

  let query = supabase
    .from("refs")
    .select(REF_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filter.genre) query = query.eq("genre", filter.genre);
  if (filter.medium) query = query.eq("medium", filter.medium);
  if (filter.language) query = query.contains("languages", [filter.language]);
  if (filter.tags && filter.tags.length > 0) {
    query = query.contains("tags", filter.tags);
  }
  if (filter.hue) {
    const ranges = bucketHueRanges(filter.hue);
    if (ranges === null) {
      query = query.is("color_hue", null);
    } else {
      // OR-join the ranges (red wraps around, so it has two).
      const parts = ranges.map(([lo, hi]) => `and(color_hue.gte.${lo},color_hue.lt.${hi})`);
      query = query.or(parts.join(","));
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  let rows = flatten(data as unknown as RefRow[] | null);

  if (filter.designerId) {
    rows = rows.filter((r) =>
      r.designers.some((d) => d.id === filter.designerId),
    );
  }

  return rows;
}

export async function fetchRef(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refs")
    .select(REF_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return flatten([data as unknown as RefRow])[0];
}

export async function fetchNotes(refId: string): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("ref_id", refId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Note[];
}

export type DesignerWithCount = Designer & { ref_count: number };

export async function fetchDesigners(): Promise<DesignerWithCount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("designers")
    .select("*, ref_designers(count)")
    .order("name", { ascending: true });
  if (error) throw error;
  type Row = Designer & { ref_designers: { count: number }[] };
  return (data ?? []).map((row) => {
    const r = row as Row;
    const { ref_designers, ...rest } = r;
    return { ...rest, ref_count: ref_designers?.[0]?.count ?? 0 };
  });
}

export async function fetchDesignerBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("designers")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Designer | null;
}

export type LinkedRef = Pick<
  Ref,
  "id" | "title" | "year" | "image_path" | "image_width" | "image_height"
>;

export async function fetchLinkedRefs(refId: string): Promise<LinkedRef[]> {
  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from("ref_links")
    .select("a_id, b_id")
    .or(`a_id.eq.${refId},b_id.eq.${refId}`);
  if (error) throw error;
  const otherIds = (links ?? []).map((l) =>
    (l as { a_id: string; b_id: string }).a_id === refId
      ? (l as { a_id: string; b_id: string }).b_id
      : (l as { a_id: string; b_id: string }).a_id,
  );
  if (otherIds.length === 0) return [];
  const { data, error: e2 } = await supabase
    .from("refs")
    .select("id, title, year, image_path, image_width, image_height")
    .in("id", otherIds);
  if (e2) throw e2;
  return (data ?? []) as LinkedRef[];
}

export async function fetchProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  // Don't expose the hash to the client — only whether one is set.
  const { data, error } = await supabase
    .from("profiles")
    .select("key, display_name, avatar_path, color, password_hash")
    .in("key", PROFILE_KEYS as readonly string[]);
  if (error) return FALLBACK_PROFILES;
  return PROFILE_KEYS.map((key) => {
    const row = (data ?? []).find(
      (r) => (r as { key: string }).key === key,
    ) as
      | (Omit<Profile, "has_password"> & { password_hash: string | null })
      | undefined;
    if (!row) return FALLBACK_PROFILES.find((p) => p.key === key)!;
    const { password_hash, ...rest } = row;
    return { ...rest, has_password: password_hash !== null && password_hash !== "" };
  });
}

export async function fetchAllTags(): Promise<string[]> {
  const supabase = await createClient();
  // Pull tags from refs and dedupe in memory. For larger archives, move this to a view/RPC.
  const { data, error } = await supabase.from("refs").select("tags");
  if (error) throw error;
  const set = new Set<string>();
  for (const row of data ?? []) {
    for (const t of (row as { tags: string[] }).tags ?? []) {
      const trimmed = t.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
