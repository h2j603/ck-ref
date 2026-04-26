import "server-only";

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

export async function fetchDesigners(): Promise<Designer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("designers")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Designer[];
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
