import "server-only";

import { bucketHueRanges, type HueBucket } from "@/lib/color";
import {
  FALLBACK_PROFILES,
  PROFILE_KEYS,
  type Profile,
} from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import {
  type Board,
  type Designer,
  type Note,
  type Ref,
  type RefAnnotation,
  type RefSort,
  type RefWithDesigners,
} from "@/lib/types";

// Re-export so existing imports of REF_SORTS/RefSort from this module keep
// working; the canonical home is lib/types so that client components can
// import them without dragging server-only into the client bundle.
export { REF_SORTS } from "@/lib/types";
export type { RefSort } from "@/lib/types";

type DesignerLite = Pick<Designer, "id" | "slug" | "name">;
type RefRow = Ref & {
  ref_designers?: { designer: DesignerLite | DesignerLite[] | null }[];
};

// Ratings are fetched in a separate query and merged so that a missing
// ref_ratings table (e.g. fresh deploy without the migration) doesn't take
// the whole gallery down with it.
const REF_COLUMNS = `
  id, title, year, source_url,
  image_path, image_width, image_height,
  genre, medium, languages, tags,
  color_hex, color_hue,
  notes_count, created_at, created_by,
  ref_designers ( designer:designers(id, slug, name) )
`;

type RefWithDesignersOnly = Ref & {
  designers: DesignerLite[];
};

function flatten(rows: RefRow[] | null | undefined): RefWithDesignersOnly[] {
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

async function attachRatings(
  rows: RefWithDesignersOnly[],
): Promise<RefWithDesigners[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const ids = rows.map((r) => r.id);
  const { data, error } = await supabase
    .from("ref_ratings")
    .select("ref_id, stars")
    .in("ref_id", ids);
  // If the table is missing or any other error happens, treat as no ratings
  // — the gallery still renders, just without averages.
  if (error || !data) {
    return rows.map((r) => ({ ...r, rating_avg: null, rating_count: 0 }));
  }
  const byRef = new Map<string, number[]>();
  for (const row of data as { ref_id: string; stars: number }[]) {
    const list = byRef.get(row.ref_id) ?? [];
    list.push(row.stars);
    byRef.set(row.ref_id, list);
  }
  return rows.map((r) => {
    const stars = byRef.get(r.id) ?? [];
    const rating_count = stars.length;
    const rating_avg =
      rating_count > 0 ? stars.reduce((s, n) => s + n, 0) / rating_count : null;
    return { ...r, rating_avg, rating_count };
  });
}

export type RefFilter = {
  genre?: string;
  medium?: string;
  language?: string;
  tags?: string[];
  designerId?: string;
  hue?: HueBucket;
  userKey?: string;
  sort?: RefSort;
  q?: string;
};

// Searches title, tags (exact), designer name, and note bodies (body / pros /
// cons). Each is a separate query; we union the matching ref IDs in JS. The
// caller filters refs to this set.
async function searchRefIds(q: string): Promise<Set<string>> {
  const supabase = await createClient();
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const [titleRes, tagRes, designerRes, bodyRes, prosRes, consRes] =
    await Promise.all([
      supabase.from("refs").select("id").ilike("title", like).limit(500),
      supabase.from("refs").select("id").contains("tags", [q]).limit(500),
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
  for (const d of (designerRes.data ?? []) as {
    ref_designers: { ref_id: string }[] | null;
  }[]) {
    for (const rd of d.ref_designers ?? []) ids.add(rd.ref_id);
  }
  for (const n of bodyRes.data ?? []) ids.add((n as { ref_id: string }).ref_id);
  for (const n of prosRes.data ?? []) ids.add((n as { ref_id: string }).ref_id);
  for (const n of consRes.data ?? []) ids.add((n as { ref_id: string }).ref_id);
  return ids;
}

export async function fetchRefs(filter: RefFilter = {}, limit = 200) {
  const supabase = await createClient();

  // Resolve text search up front; an empty match-set means no results, which
  // we return immediately rather than feeding [] into .in(...).
  let searchIds: Set<string> | null = null;
  if (filter.q && filter.q.trim()) {
    searchIds = await searchRefIds(filter.q.trim());
    if (searchIds.size === 0) return [];
  }

  let query = supabase
    .from("refs")
    .select(REF_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (searchIds) query = query.in("id", [...searchIds]);
  if (filter.userKey) query = query.eq("created_by", filter.userKey);
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
  let bare = flatten(data as unknown as RefRow[] | null);

  if (filter.designerId) {
    bare = bare.filter((r) =>
      r.designers.some((d) => d.id === filter.designerId),
    );
  }

  let rows = await attachRatings(bare);

  // rating_avg / rating_count are computed in JS so we sort here too.
  // Unrated refs sink to the bottom on rating-based sorts; ties fall back
  // to created_at desc so order is stable.
  if (filter.sort === "rating") {
    rows.sort((a, b) => {
      const aRated = a.rating_avg !== null;
      const bRated = b.rating_avg !== null;
      if (aRated && !bRated) return -1;
      if (!aRated && bRated) return 1;
      if (aRated && bRated && a.rating_avg !== b.rating_avg) {
        return (b.rating_avg ?? 0) - (a.rating_avg ?? 0);
      }
      return b.created_at.localeCompare(a.created_at);
    });
  } else if (filter.sort === "popular") {
    rows.sort((a, b) => {
      if (a.rating_count !== b.rating_count) {
        return b.rating_count - a.rating_count;
      }
      return b.created_at.localeCompare(a.created_at);
    });
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
  const bare = flatten([data as unknown as RefRow]);
  const [row] = await attachRatings(bare);
  return row ?? null;
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

// One head-count per profile (3 round trips). Cheap and avoids transferring
// rows we don't need.
export async function fetchProfileRefCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const entries = await Promise.all(
    PROFILE_KEYS.map(async (key) => {
      const { count } = await supabase
        .from("refs")
        .select("*", { count: "exact", head: true })
        .eq("created_by", key);
      return [key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function countRefsByUserSince(
  userKey: string,
  sinceIso: string,
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("refs")
    .select("*", { count: "exact", head: true })
    .eq("created_by", userKey)
    .gte("created_at", sinceIso);
  return count ?? 0;
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

// BOARDS --------------------------------------------------------------------

type BoardCover = Pick<Ref, "id" | "image_path" | "image_width" | "image_height">;
export type BoardSummary = Board & {
  item_count: number;
  cover_refs: BoardCover[];
};

const BOARD_COVER_LIMIT = 4;

export async function fetchBoards(): Promise<BoardSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boards")
    .select(
      `id, title, description, created_at, created_by,
       board_items ( position, ref:refs(id, image_path, image_width, image_height) )`,
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Row = Board & {
    board_items: { position: number; ref: BoardCover | BoardCover[] | null }[];
  };
  return (data ?? []).map((raw) => {
    const r = raw as Row;
    const items = (r.board_items ?? [])
      .map((bi) => {
        const ref = Array.isArray(bi.ref) ? bi.ref[0] : bi.ref;
        return ref ? { position: bi.position, ref } : null;
      })
      .filter((x): x is { position: number; ref: BoardCover } => x !== null)
      .sort((a, b) => a.position - b.position);
    const { board_items, ...rest } = r;
    void board_items;
    return {
      ...rest,
      item_count: items.length,
      cover_refs: items.slice(0, BOARD_COVER_LIMIT).map((i) => i.ref),
    };
  });
}

export async function fetchBoard(id: string): Promise<Board | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Board | null;
}

export async function fetchBoardRefs(boardId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_items")
    .select(
      `position, ref:refs(${REF_COLUMNS_FOR_BOARD})`,
    )
    .eq("board_id", boardId)
    .order("position", { ascending: true });
  if (error) throw error;
  type RawRef = Ref & {
    ref_designers?: {
      designer:
        | Pick<Designer, "id" | "slug" | "name">
        | Pick<Designer, "id" | "slug" | "name">[]
        | null;
    }[];
  };
  type Row = { position: number; ref: RawRef | RawRef[] | null };
  const rows = (data ?? []) as unknown as Row[];
  const bare = rows
    .map((r) => (Array.isArray(r.ref) ? r.ref[0] ?? null : r.ref))
    .filter((r): r is RawRef => r !== null)
    .map((ref) => {
      const { ref_designers, ...rest } = ref;
      const designers: Pick<Designer, "id" | "slug" | "name">[] = [];
      for (const rd of ref_designers ?? []) {
        const d = rd.designer;
        if (!d) continue;
        if (Array.isArray(d)) designers.push(...d);
        else designers.push(d);
      }
      return { ...rest, designers };
    });
  return attachRatings(bare);
}

export async function fetchSimilarRefs(
  refId: string,
  limit = 6,
): Promise<RefWithDesigners[]> {
  const supabase = await createClient();
  const { data: current, error } = await supabase
    .from("refs")
    .select(
      "id, tags, color_hue, genre, medium, ref_designers(designer_id)",
    )
    .eq("id", refId)
    .maybeSingle();
  if (error || !current) return [];
  type Cur = {
    id: string;
    tags: string[] | null;
    color_hue: number | null;
    genre: string | null;
    medium: string | null;
    ref_designers: { designer_id: string }[] | null;
  };
  const cur = current as Cur;
  const designerIds = (cur.ref_designers ?? []).map((rd) => rd.designer_id);
  const tags = cur.tags ?? [];

  // Pull a window of recent refs and score them against the current one.
  // For a 3-user archive this is plenty; we're not paginating millions.
  const candidates = await fetchRefs({}, 200).catch(
    () => [] as RefWithDesigners[],
  );
  const scored = candidates
    .filter((r) => r.id !== refId)
    .map((r) => {
      let score = 0;
      const sharedDesigners = r.designers.filter((d) =>
        designerIds.includes(d.id),
      ).length;
      score += sharedDesigners * 5;
      const sharedTags = r.tags.filter((t) => tags.includes(t)).length;
      score += sharedTags * 2;
      if (r.genre && r.genre === cur.genre) score += 1;
      if (r.medium && r.medium === cur.medium) score += 1;
      if (
        cur.color_hue !== null &&
        r.color_hue !== null &&
        Math.abs(cur.color_hue - r.color_hue) <= 20
      ) {
        score += 1;
      }
      return { r, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.r.created_at.localeCompare(a.r.created_at));
  return scored.slice(0, limit).map((s) => s.r);
}

export async function fetchRefAnnotations(
  refId: string,
): Promise<RefAnnotation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_annotations")
    .select("*")
    .eq("ref_id", refId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as RefAnnotation[];
}

export async function fetchRefRatings(refId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_ratings")
    .select("ref_id, user_key, stars, rated_at")
    .eq("ref_id", refId);
  if (error) throw error;
  return (data ?? []) as {
    ref_id: string;
    user_key: string;
    stars: number;
    rated_at: string;
  }[];
}

const REF_COLUMNS_FOR_BOARD = `
  id, title, year, source_url,
  image_path, image_width, image_height,
  genre, medium, languages, tags,
  color_hex, color_hue,
  notes_count, created_at, created_by,
  ref_designers ( designer:designers(id, slug, name) )
`;

// ACTIVITY FEED -------------------------------------------------------------
// Pulls a window of recent activity from each source in parallel, merges by
// timestamp, slices the top N. Each source is wrapped so a missing table /
// query error empties just that lane instead of taking the whole feed down.

export type ActivityItem = {
  kind: "ref" | "note" | "reply" | "rating" | "board" | "annotation";
  at: string;
  actor: string;
  ref?: { id: string; title: string | null; image_path: string };
  board?: { id: string; title: string };
  stars?: number;
  bodySnippet?: string;
};

type EmbeddedRef = {
  id: string;
  title: string | null;
  image_path: string;
};

function pickRef(value: EmbeddedRef | EmbeddedRef[] | null | undefined): EmbeddedRef | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function fetchActivity(limit = 50): Promise<ActivityItem[]> {
  const supabase = await createClient();
  const fetchSafe = async <T>(
    promise: PromiseLike<{ data: T[] | null; error: unknown }>,
  ): Promise<T[]> => {
    try {
      const { data } = await promise;
      return data ?? [];
    } catch {
      return [];
    }
  };

  const [refRows, noteRows, ratingRows, boardRows, annotationRows] =
    await Promise.all([
      fetchSafe<{
        id: string;
        title: string | null;
        image_path: string;
        created_by: string | null;
        created_at: string;
      }>(
        supabase
          .from("refs")
          .select("id, title, image_path, created_by, created_at")
          .order("created_at", { ascending: false })
          .limit(limit),
      ),
      fetchSafe<{
        id: string;
        ref_id: string;
        parent_id: string | null;
        body: string | null;
        pros: string | null;
        cons: string | null;
        author: string;
        created_at: string;
        refs: EmbeddedRef | EmbeddedRef[] | null;
      }>(
        supabase
          .from("notes")
          .select(
            "id, ref_id, parent_id, body, pros, cons, author, created_at, refs(id, title, image_path)",
          )
          .order("created_at", { ascending: false })
          .limit(limit),
      ),
      fetchSafe<{
        ref_id: string;
        user_key: string;
        stars: number;
        rated_at: string;
        refs: EmbeddedRef | EmbeddedRef[] | null;
      }>(
        supabase
          .from("ref_ratings")
          .select("ref_id, user_key, stars, rated_at, refs(id, title, image_path)")
          .order("rated_at", { ascending: false })
          .limit(limit),
      ),
      fetchSafe<{
        id: string;
        title: string;
        created_by: string | null;
        created_at: string;
      }>(
        supabase
          .from("boards")
          .select("id, title, created_by, created_at")
          .order("created_at", { ascending: false })
          .limit(limit),
      ),
      fetchSafe<{
        ref_id: string;
        body: string;
        author: string;
        created_at: string;
        refs: EmbeddedRef | EmbeddedRef[] | null;
      }>(
        supabase
          .from("ref_annotations")
          .select("ref_id, body, author, created_at, refs(id, title, image_path)")
          .order("created_at", { ascending: false })
          .limit(limit),
      ),
    ]);

  const items: ActivityItem[] = [];

  for (const r of refRows) {
    if (!r.created_by) continue;
    items.push({
      kind: "ref",
      at: r.created_at,
      actor: r.created_by,
      ref: { id: r.id, title: r.title, image_path: r.image_path },
    });
  }

  for (const n of noteRows) {
    const ref = pickRef(n.refs);
    if (!ref) continue;
    const snippet = (n.body ?? n.pros ?? n.cons ?? "").slice(0, 80);
    items.push({
      kind: n.parent_id ? "reply" : "note",
      at: n.created_at,
      actor: n.author,
      ref,
      bodySnippet: snippet,
    });
  }

  for (const r of ratingRows) {
    const ref = pickRef(r.refs);
    if (!ref) continue;
    items.push({
      kind: "rating",
      at: r.rated_at,
      actor: r.user_key,
      ref,
      stars: r.stars,
    });
  }

  for (const b of boardRows) {
    if (!b.created_by) continue;
    items.push({
      kind: "board",
      at: b.created_at,
      actor: b.created_by,
      board: { id: b.id, title: b.title },
    });
  }

  for (const a of annotationRows) {
    const ref = pickRef(a.refs);
    if (!ref) continue;
    items.push({
      kind: "annotation",
      at: a.created_at,
      actor: a.author,
      ref,
      bodySnippet: (a.body ?? "").slice(0, 80),
    });
  }

  return items
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
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
