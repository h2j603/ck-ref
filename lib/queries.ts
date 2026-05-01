import "server-only";

import { bucketHueRanges, type HueBucket } from "@/lib/color";
import {
  FALLBACK_PROFILES,
  PROFILE_KEYS,
  type Profile,
} from "@/lib/profiles";
import { createClient } from "@/lib/supabase/server";
import {
  type Announcement,
  type Board,
  type Designer,
  type CalendarEvent,
  type Note,
  type Notification,
  type Project,
  type ProjectPlanning,
  type ProjectPositioningMap,
  type ProjectPositioningPoint,
  type ProjectStatus,
  type ProjectUpdate,
  type Ref,
  type ProjectGrid,
  type RefAnnotation,
  type RefGrid,
  type RefImage,
  type RefSort,
  type RefWithDesigners,
  type UpdateReaction,
} from "@/lib/types";

// Re-export so existing imports of REF_SORTS/RefSort from this module keep
// working; the canonical home is lib/types so that client components can
// import them without dragging server-only into the client bundle.
export { REF_SORTS } from "@/lib/types";
export type { RefSort } from "@/lib/types";

type DesignerLite = Pick<Designer, "id" | "slug" | "name">;
type RefRow = Ref & {
  ref_designers?: { designer: DesignerLite | DesignerLite[] | null }[];
  ref_images?: { count: number }[];
};

// Ratings + extra image counts are fetched separately so a missing table on
// a fresh deploy doesn't take the whole gallery down. The embed below pulls
// ref_images count cheaply alongside.
const REF_COLUMNS = `
  id, title, year, source_url,
  image_path, image_width, image_height,
  genres, medium, languages, tags,
  color_hex, color_hue, ocr_text,
  notes_count, created_at, created_by,
  ref_designers ( designer:designers(id, slug, name) ),
  ref_images ( count )
`;

type RefWithDesignersOnly = Ref & {
  designers: DesignerLite[];
  extra_image_count: number;
};

function flatten(rows: RefRow[] | null | undefined): RefWithDesignersOnly[] {
  if (!rows) return [];
  return rows.map(({ ref_designers, ref_images, ...rest }) => {
    const designers: DesignerLite[] = [];
    for (const rd of ref_designers ?? []) {
      const d = rd.designer;
      if (!d) continue;
      if (Array.isArray(d)) designers.push(...d);
      else designers.push(d);
    }
    const extra_image_count = ref_images?.[0]?.count ?? 0;
    return { ...rest, designers, extra_image_count };
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
  // When true, restrict to refs that have at least one ref_grids row
  // — useful for browsing the "analyzed" subset.
  hasGrid?: boolean;
};

// Searches title, tags (exact), designer name, and note bodies (body / pros /
// cons). Each is a separate query; we union the matching ref IDs in JS. The
// caller filters refs to this set.
async function searchRefIds(q: string): Promise<Set<string>> {
  const supabase = await createClient();
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  // Same coalescing as lib/refSearch.ts:searchRefIdsClient — same-table
  // ilike predicates go through one .or() so we issue 3 round-trips
  // instead of 7. Tags stay separate to dodge contains() inside or().
  const refsOr = `title.ilike.${like},ocr_text.ilike.${like}`;
  const notesOr = `body.ilike.${like},pros.ilike.${like},cons.ilike.${like}`;

  const [refsRes, tagsRes, designerRes, notesRes] = await Promise.all([
    supabase.from("refs").select("id").or(refsOr).limit(200),
    supabase.from("refs").select("id").contains("tags", [q]).limit(200),
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
  for (const n of notesRes.data ?? []) ids.add((n as { ref_id: string }).ref_id);
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

  // Restrict to refs that have at least one analyzed grid. Loaded as a
  // small id list and intersected with the text-search set if both
  // filters are active.
  if (filter.hasGrid) {
    const { data } = await supabase
      .from("ref_grids")
      .select("ref_id")
      .limit(2000);
    const gridIds = new Set(
      ((data ?? []) as { ref_id: string }[]).map((r) => r.ref_id),
    );
    if (gridIds.size === 0) return [];
    if (searchIds) {
      for (const id of [...searchIds]) {
        if (!gridIds.has(id)) searchIds.delete(id);
      }
      if (searchIds.size === 0) return [];
    } else {
      searchIds = gridIds;
    }
  }

  let query = supabase
    .from("refs")
    .select(REF_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (searchIds) query = query.in("id", [...searchIds]);
  if (filter.userKey) query = query.eq("created_by", filter.userKey);
  if (filter.genre) query = query.contains("genres", [filter.genre]);
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
  } else if (filter.sort === "year_desc" || filter.sort === "year_asc") {
    // Year-based browsing isn't useful for refs that don't have a year on
    // them — they'd just clump at the bottom in a meaningless order — so
    // drop them from the result set entirely instead of sinking them.
    rows = rows.filter((r) => r.year !== null);
    const dir = filter.sort === "year_asc" ? 1 : -1;
    rows.sort((a, b) => {
      // Both years are non-null after the filter above.
      const ay = a.year as number;
      const by = b.year as number;
      if (ay !== by) return (by - ay) * dir;
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

// PROJECTS (WIP) ------------------------------------------------------------

export type ProjectSummary = Project & {
  update_count: number;
  cover: { image_path: string; image_width: number | null; image_height: number | null } | null;
};

export async function fetchProjects(filter?: {
  status?: ProjectStatus;
}): Promise<ProjectSummary[]> {
  const supabase = await createClient();
  // We need two facts about each project's updates: (a) the latest one (for
  // the cover), (b) the total count. Pull both in a single roundtrip:
  //   - the embed asks PostgREST to order project_updates by created_at desc
  //     so updates[0] is guaranteed to be the latest
  //   - a parallel head-count query gives the total per project, since the
  //     embed doesn't easily expose count without dragging every row
  let q = supabase
    .from("projects")
    .select(
      "*, project_updates(image_path, image_width, image_height, created_at)",
    )
    .order("created_at", { ascending: false })
    .order("created_at", {
      ascending: false,
      referencedTable: "project_updates",
    });
  if (filter?.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) throw error;
  type Row = Project & {
    project_updates: {
      image_path: string;
      image_width: number | null;
      image_height: number | null;
      created_at: string;
    }[];
  };
  return (data ?? []).map((raw) => {
    const row = raw as Row;
    const updates = row.project_updates ?? [];
    const latest = updates[0] ?? null;
    const cover = latest
      ? {
          image_path: latest.image_path,
          image_width: latest.image_width,
          image_height: latest.image_height,
        }
      : null;
    const { project_updates, ...rest } = row;
    void project_updates;
    return { ...rest, update_count: updates.length, cover };
  });
}

export async function fetchProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Project | null;
}

export async function fetchProjectUpdates(
  projectId: string,
): Promise<ProjectUpdate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_updates")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectUpdate[];
}

export async function fetchUpdateReactions(
  updateIds: string[],
): Promise<Map<string, UpdateReaction[]>> {
  const out = new Map<string, UpdateReaction[]>();
  if (updateIds.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("update_reactions")
    .select("project_update_id, user_key, emoji, reacted_at")
    .in("project_update_id", updateIds);
  if (error || !data) return out;
  for (const row of data as UpdateReaction[]) {
    const list = out.get(row.project_update_id) ?? [];
    list.push(row);
    out.set(row.project_update_id, list);
  }
  return out;
}

export type InspirationRef = RefWithDesigners & {
  reason: string | null;
  added_by: string | null;
};

export async function fetchProjectInspirationRefs(
  projectId: string,
): Promise<InspirationRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_refs")
    .select(`reason, added_by, ref:refs(${REF_COLUMNS})`)
    .eq("project_id", projectId);
  if (error) return [];
  type Row = {
    reason: string | null;
    added_by: string | null;
    ref: RefRow | RefRow[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const meta = new Map<string, { reason: string | null; added_by: string | null }>();
  const refRows: RefRow[] = [];
  for (const row of rows) {
    const ref = Array.isArray(row.ref) ? row.ref[0] ?? null : row.ref;
    if (!ref) continue;
    refRows.push(ref);
    meta.set(ref.id, { reason: row.reason, added_by: row.added_by });
  }
  const bare = flatten(refRows);
  const withRatings = await attachRatings(bare);
  return withRatings.map((r) => ({
    ...r,
    reason: meta.get(r.id)?.reason ?? null,
    added_by: meta.get(r.id)?.added_by ?? null,
  }));
}

// Positioning maps. A project can carry several maps now (brand, tone,
// audience…); each comes with its own axis pair and points. Points are
// returned in insertion order so the UI keeps a stable z-stack. Maps are
// ordered by `position` then created_at so manual reordering wins.
export type PositioningMapWithPoints = ProjectPositioningMap & {
  points: (ProjectPositioningPoint & {
    ref: Pick<
      Ref,
      "id" | "title" | "image_path" | "image_width" | "image_height" | "color_hex"
    > | null;
  })[];
};

export async function fetchProjectPositioningMaps(
  projectId: string,
): Promise<PositioningMapWithPoints[]> {
  const supabase = await createClient();
  const [mapsRes, pointsRes] = await Promise.all([
    supabase
      .from("project_positioning_maps")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("project_positioning_points")
      .select(
        `id, project_id, map_id, ref_id, label, x, y, is_self, color, created_at, created_by,
         ref:refs(id, title, image_path, image_width, image_height, color_hex)`,
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);
  const maps = (mapsRes.data ?? []) as ProjectPositioningMap[];
  type RawRef = Pick<
    Ref,
    "id" | "title" | "image_path" | "image_width" | "image_height" | "color_hex"
  >;
  type PointRow = ProjectPositioningPoint & {
    ref: RawRef | RawRef[] | null;
  };
  const allPoints = ((pointsRes.data ?? []) as PointRow[]).map((row) => {
    const ref = Array.isArray(row.ref) ? row.ref[0] ?? null : row.ref;
    const { ref: _ref, ...rest } = row;
    void _ref;
    return { ...rest, ref };
  });
  return maps.map((map) => ({
    ...map,
    points: allPoints.filter((p) => p.map_id === map.id),
  }));
}

// Convenience: planning is stored as jsonb so the column reads back as a
// generic object. We don't validate shape here — sections are all optional.
// Old rows written before keywords were split kept everything in `tone`;
// surface those as positive_keywords on read so users don't lose them.
// Roles started life as a free-form mention string, then moved to a
// structured array; drop any legacy string so callers never see a value
// they don't expect.
export function readPlanning(value: unknown): ProjectPlanning {
  if (!value || typeof value !== "object") return {};
  const planning = { ...(value as ProjectPlanning) };
  if (
    !planning.positive_keywords &&
    Array.isArray(planning.tone) &&
    planning.tone.length > 0
  ) {
    planning.positive_keywords = planning.tone;
  }
  delete planning.tone;
  if (!Array.isArray(planning.roles)) {
    delete planning.roles;
  }
  if (!Array.isArray(planning.success_metrics)) {
    delete planning.success_metrics;
  }
  // Deliverables grew from a free-form string into a list of items, one
  // per row. Migrate any legacy string by splitting on commas / newlines
  // / "·" so older planning blocks light up as rows on first read.
  const rawDeliverables = (planning as { deliverables?: unknown }).deliverables;
  if (typeof rawDeliverables === "string") {
    const items = rawDeliverables
      .split(/[,\n·]/)
      .map((s) => s.trim())
      .filter(Boolean);
    planning.deliverables = items.length > 0 ? items : undefined;
  } else if (!Array.isArray(rawDeliverables)) {
    delete planning.deliverables;
  }
  return planning;
}

// Counts of "decision" / "open_question" kind notes attached to the project,
// for the inline summary above the discussion thread. We don't need the
// note rows themselves here — just the totals — so we use head:true count
// queries to avoid pulling bodies.
export async function fetchProjectNoteCounts(
  projectId: string,
): Promise<{ decisions: number; openQuestions: number }> {
  const supabase = await createClient();
  const [decisionsRes, openRes] = await Promise.all([
    supabase
      .from("notes")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("kind", "decision"),
    supabase
      .from("notes")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("kind", "open_question"),
  ]);
  return {
    decisions: decisionsRes.count ?? 0,
    openQuestions: openRes.count ?? 0,
  };
}

// Project milestones live in the shared events table with kind='milestone'
// so they show up on the calendar too. The planning page just wants them
// sorted by date ascending; calendar handles the broader query.
export async function fetchProjectMilestones(
  projectId: string,
): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("project_id", projectId)
    .eq("kind", "milestone")
    .order("starts_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as CalendarEvent[];
}

export async function fetchUpdateRefs(
  updateId: string,
): Promise<InspirationRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_update_refs")
    .select(`reason, added_by, ref:refs(${REF_COLUMNS})`)
    .eq("project_update_id", updateId);
  if (error) return [];
  type Row = {
    reason: string | null;
    added_by: string | null;
    ref: RefRow | RefRow[] | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const meta = new Map<string, { reason: string | null; added_by: string | null }>();
  const refRows: RefRow[] = [];
  for (const row of rows) {
    const ref = Array.isArray(row.ref) ? row.ref[0] ?? null : row.ref;
    if (!ref) continue;
    refRows.push(ref);
    meta.set(ref.id, { reason: row.reason, added_by: row.added_by });
  }
  const bare = flatten(refRows);
  const withRatings = await attachRatings(bare);
  return withRatings.map((r) => ({
    ...r,
    reason: meta.get(r.id)?.reason ?? null,
    added_by: meta.get(r.id)?.added_by ?? null,
  }));
}

// Polymorphic notes fetch — accepts the same target shape that NoteList uses.
export async function fetchNotesFor(target: {
  kind: "ref" | "project" | "project_update";
  id: string;
}): Promise<Note[]> {
  const supabase = await createClient();
  const column =
    target.kind === "ref"
      ? "ref_id"
      : target.kind === "project"
        ? "project_id"
        : "project_update_id";
  // Top-level notes for the target + their replies (parent_id chain).
  // Simplest: pull every note matching the target column, plus every note
  // whose parent is in that set. Two queries; small at this scale.
  const { data: top, error: topErr } = await supabase
    .from("notes")
    .select("*")
    .eq(column, target.id)
    .order("created_at", { ascending: true });
  if (topErr) return [];
  const rows = (top ?? []) as Note[];
  const ids = rows.map((n) => n.id);
  if (ids.length === 0) return [];
  const { data: replies, error: replyErr } = await supabase
    .from("notes")
    .select("*")
    .in("parent_id", ids)
    .order("created_at", { ascending: true });
  if (replyErr) return rows;
  // Merge, dedupe by id (a note in `rows` is also returned in replies if it
  // has parent_id pointing inside the set — shouldn't happen but defend).
  const byId = new Map<string, Note>();
  for (const n of rows) byId.set(n.id, n);
  for (const n of (replies ?? []) as Note[]) byId.set(n.id, n);
  return [...byId.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
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
    ref_images?: { count: number }[];
  };
  type Row = { position: number; ref: RawRef | RawRef[] | null };
  const rows = (data ?? []) as unknown as Row[];
  const bare = rows
    .map((r) => (Array.isArray(r.ref) ? r.ref[0] ?? null : r.ref))
    .filter((r): r is RawRef => r !== null)
    .map((ref) => {
      const { ref_designers, ref_images, ...rest } = ref;
      const designers: Pick<Designer, "id" | "slug" | "name">[] = [];
      for (const rd of ref_designers ?? []) {
        const d = rd.designer;
        if (!d) continue;
        if (Array.isArray(d)) designers.push(...d);
        else designers.push(d);
      }
      const extra_image_count = ref_images?.[0]?.count ?? 0;
      return { ...rest, designers, extra_image_count };
    });
  return attachRatings(bare);
}

export async function fetchRefExtraImages(refId: string): Promise<RefImage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_images")
    .select("*")
    .eq("ref_id", refId)
    .order("position", { ascending: true });
  if (error) return [];
  return (data ?? []) as RefImage[];
}

export async function fetchRefGrids(refId: string): Promise<RefGrid[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_grids")
    .select("*")
    .eq("ref_id", refId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as RefGrid[];
}

export async function fetchProjectGrids(
  projectId: string,
): Promise<ProjectGrid[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_grids")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as ProjectGrid[];
}

// Grid gallery: every "original" ref grid (source_grid_id IS NULL) with
// the source ref's metadata + counts of refs/projects that descended
// from it. Originals are the natural unit because copies always trace
// back; we surface them and let users drill in to see the lineage.
export type GridGalleryEntry = {
  grid: RefGrid;
  source_ref: {
    id: string;
    title: string | null;
    image_path: string;
    image_width: number | null;
    image_height: number | null;
    genres: string[];
  } | null;
  applied_to_refs: number;
  applied_to_projects: number;
  applied_refs: { id: string; title: string | null; image_path: string }[];
  applied_projects: { id: string; title: string }[];
};

export async function fetchGridGallery(): Promise<GridGalleryEntry[]> {
  const supabase = await createClient();
  const { data: originals } = await supabase
    .from("ref_grids")
    .select("*")
    .is("source_grid_id", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!originals || originals.length === 0) return [];

  const refIds = [...new Set(originals.map((g) => g.ref_id as string))];
  const ids = originals.map((g) => g.id as string);

  const [refsRes, copiesRes, projectCopiesRes] = await Promise.all([
    supabase
      .from("refs")
      .select("id, title, image_path, image_width, image_height, genres")
      .in("id", refIds),
    supabase
      .from("ref_grids")
      .select("id, source_grid_id, ref_id, refs!inner(id, title, image_path)")
      .in("source_grid_id", ids),
    supabase
      .from("project_grids")
      .select("id, source_grid_id, project_id, projects!inner(id, title)")
      .in("source_grid_id", ids),
  ]);

  type RefRow = {
    id: string;
    title: string | null;
    image_path: string;
    image_width: number | null;
    image_height: number | null;
    genres: string[];
  };
  const refsById = new Map<string, RefRow>();
  for (const r of (refsRes.data ?? []) as RefRow[]) refsById.set(r.id, r);

  type RefCopy = {
    source_grid_id: string;
    refs:
      | { id: string; title: string | null; image_path: string }
      | { id: string; title: string | null; image_path: string }[]
      | null;
  };
  const refsBySource = new Map<
    string,
    { id: string; title: string | null; image_path: string }[]
  >();
  for (const c of (copiesRes.data ?? []) as unknown as RefCopy[]) {
    const ref = Array.isArray(c.refs) ? c.refs[0] : c.refs;
    if (!ref) continue;
    if (!refsBySource.has(c.source_grid_id))
      refsBySource.set(c.source_grid_id, []);
    refsBySource.get(c.source_grid_id)!.push(ref);
  }

  type ProjCopy = {
    source_grid_id: string;
    projects:
      | { id: string; title: string }
      | { id: string; title: string }[]
      | null;
  };
  const projsBySource = new Map<string, { id: string; title: string }[]>();
  for (const c of (projectCopiesRes.data ?? []) as unknown as ProjCopy[]) {
    const proj = Array.isArray(c.projects) ? c.projects[0] : c.projects;
    if (!proj) continue;
    if (!projsBySource.has(c.source_grid_id))
      projsBySource.set(c.source_grid_id, []);
    projsBySource.get(c.source_grid_id)!.push(proj);
  }

  return (originals as RefGrid[]).map((g) => {
    const appliedRefs = refsBySource.get(g.id) ?? [];
    const appliedProjects = projsBySource.get(g.id) ?? [];
    return {
      grid: g,
      source_ref: refsById.get(g.ref_id) ?? null,
      applied_to_refs: appliedRefs.length,
      applied_to_projects: appliedProjects.length,
      applied_refs: appliedRefs,
      applied_projects: appliedProjects,
    };
  });
}

// Visual-similarity weight for the hybrid score. Cosine similarity is in
// [-1, 1] but in practice CLIP image-image scores live in [0.5, 1]. Using
// 8 puts a perfect visual match worth roughly the same as a ~4-tag overlap,
// which felt right in casual testing.
const VISUAL_WEIGHT = 8;

export async function fetchSimilarRefs(
  refId: string,
  limit = 6,
): Promise<RefWithDesigners[]> {
  const supabase = await createClient();
  const { data: current, error } = await supabase
    .from("refs")
    .select(
      "id, tags, color_hue, genres, medium, ref_designers(designer_id), embedding",
    )
    .eq("id", refId)
    .maybeSingle();
  if (error || !current) return [];
  type Cur = {
    id: string;
    tags: string[] | null;
    color_hue: number | null;
    genres: string[] | null;
    medium: string | null;
    ref_designers: { designer_id: string }[] | null;
    embedding: number[] | string | null;
  };
  const cur = current as Cur;
  const designerIds = (cur.ref_designers ?? []).map((rd) => rd.designer_id);
  const tags = cur.tags ?? [];

  // If the current ref has an embedding, query pgvector for the top-N
  // nearest neighbors and merge their visual similarity into the metadata
  // score. Otherwise fall back to metadata-only over a recent window.
  const visualScores = new Map<string, number>();
  if (cur.embedding != null) {
    const queryEmbedding =
      typeof cur.embedding === "string"
        ? cur.embedding
        : `[${(cur.embedding as number[]).join(",")}]`;
    const { data: nn } = await supabase.rpc("similar_refs_by_embedding", {
      query_embedding: queryEmbedding,
      match_count: 30,
      exclude_id: refId,
    });
    for (const row of (nn ?? []) as { id: string; similarity: number }[]) {
      visualScores.set(row.id, row.similarity);
    }
  }

  // Pull a window of recent refs and score them against the current one.
  // For a 3-user archive this is plenty; we're not paginating millions.
  const candidates = await fetchRefs({}, 200).catch(
    () => [] as RefWithDesigners[],
  );

  // Make sure every visual neighbor is in the candidate set, even if it's
  // older than the recent window — we don't want to miss a strong match
  // just because it was uploaded last year.
  const candidateIds = new Set(candidates.map((c) => c.id));
  const missingVisualIds = [...visualScores.keys()].filter(
    (id) => !candidateIds.has(id) && id !== refId,
  );
  if (missingVisualIds.length > 0) {
    const extras = await fetchRefsByIds(missingVisualIds).catch(
      () => [] as RefWithDesigners[],
    );
    candidates.push(...extras);
  }

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
      const sharedGenres = r.genres.filter((g) =>
        (cur.genres ?? []).includes(g),
      ).length;
      score += sharedGenres;
      if (r.medium && r.medium === cur.medium) score += 1;
      if (
        cur.color_hue !== null &&
        r.color_hue !== null &&
        Math.abs(cur.color_hue - r.color_hue) <= 20
      ) {
        score += 1;
      }
      const visual = visualScores.get(r.id);
      if (visual !== undefined) {
        score += visual * VISUAL_WEIGHT;
      }
      return { r, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.r.created_at.localeCompare(a.r.created_at));
  return scored.slice(0, limit).map((s) => s.r);
}

async function fetchRefsByIds(ids: string[]): Promise<RefWithDesigners[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refs")
    .select(REF_COLUMNS)
    .in("id", ids);
  if (error) return [];
  const bare = flatten(data as RefRow[]);
  return attachRatings(bare);
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

export async function fetchRefImageAnnotations(
  refImageIds: string[],
): Promise<Record<string, RefAnnotation[]>> {
  if (refImageIds.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ref_annotations")
    .select("*")
    .in("ref_image_id", refImageIds)
    .order("created_at", { ascending: true });
  if (error) return {};
  const grouped: Record<string, RefAnnotation[]> = {};
  for (const row of (data ?? []) as RefAnnotation[]) {
    if (!row.ref_image_id) continue;
    (grouped[row.ref_image_id] ??= []).push(row);
  }
  return grouped;
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
  genres, medium, languages, tags,
  color_hex, color_hue, ocr_text,
  notes_count, created_at, created_by,
  ref_designers ( designer:designers(id, slug, name) ),
  ref_images ( count )
`;

// ACTIVITY FEED -------------------------------------------------------------
// Pulls a window of recent activity from each source in parallel, merges by
// timestamp, slices the top N. Each source is wrapped so a missing table /
// query error empties just that lane instead of taking the whole feed down.

export type ActivityItem = {
  // "note" / "reply" — comment on something I own, or reply to my comment
  // "annotation" — annotation on my ref
  // "rating" — rating on my ref
  kind: "note" | "reply" | "rating" | "annotation";
  at: string;
  actor: string;
  // Exactly one of these is set, picked from the underlying note's
  // discriminated target columns:
  refTarget?: { id: string; title: string | null; image_path: string };
  projectTarget?: { id: string; title: string };
  updateTarget?: {
    id: string;
    projectId: string;
    projectTitle: string;
    image_path: string;
    image_width: number | null;
    image_height: number | null;
  };
  noteId?: string;
  annotationId?: string;
  stars?: number;
  bodySnippet?: string;
  reason: "my_ref" | "my_project" | "my_update" | "reply_to_me";
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

type EmbeddedProject = { id: string; title: string };
type EmbeddedUpdate = {
  id: string;
  project_id: string;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  projects: EmbeddedProject | EmbeddedProject[] | null;
};

function pickProject(
  value: EmbeddedProject | EmbeddedProject[] | null | undefined,
): EmbeddedProject | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
function pickUpdate(
  value: EmbeddedUpdate | EmbeddedUpdate[] | null | undefined,
): EmbeddedUpdate | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

// Build ActivityItem target fields from a note row's three embedded targets.
// Returns null if none resolve (shouldn't happen given the check constraint).
function noteTargets(n: NoteRowRich): Pick<
  ActivityItem,
  "refTarget" | "projectTarget" | "updateTarget"
> | null {
  const ref = pickRef(n.refs);
  if (ref) return { refTarget: ref };
  const project = pickProject(n.projects);
  if (project) return { projectTarget: project };
  const update = pickUpdate(n.project_updates);
  if (update) {
    const proj = pickProject(update.projects);
    if (!proj) return null;
    return {
      updateTarget: {
        id: update.id,
        projectId: update.project_id,
        projectTitle: proj.title,
        image_path: update.image_path,
        image_width: update.image_width,
        image_height: update.image_height,
      },
    };
  }
  return null;
}

type NoteRowRich = {
  id: string;
  ref_id: string | null;
  project_id: string | null;
  project_update_id: string | null;
  parent_id: string | null;
  body: string | null;
  pros: string | null;
  cons: string | null;
  author: string;
  created_at: string;
  refs: EmbeddedRef | EmbeddedRef[] | null;
  projects: EmbeddedProject | EmbeddedProject[] | null;
  project_updates: EmbeddedUpdate | EmbeddedUpdate[] | null;
};

const NOTE_EMBED =
  "id, ref_id, project_id, project_update_id, parent_id, body, pros, cons, author, created_at, " +
  "refs(id, title, image_path), " +
  "projects(id, title), " +
  "project_updates(id, project_id, image_path, image_width, image_height, projects(id, title))";

// Inbox-style activity: only stuff that touches the current user. Six lanes:
// notes on my refs, notes on my projects, notes on my updates, replies to my
// notes (on any target), annotations on my refs, ratings on my refs — all by
// other people.
export async function fetchActivityForMe(
  me: string,
  limit = 50,
): Promise<ActivityItem[]> {
  const supabase = await createClient();
  // PostgREST's deeply-nested embeds defeat its type inference; we accept
  // unknown here and assert the shape per-call.
  const fetchSafe = async <T>(
    promise: PromiseLike<{ data: unknown; error: unknown }>,
  ): Promise<T[]> => {
    try {
      const { data } = await promise;
      return (data ?? []) as T[];
    } catch {
      return [];
    }
  };

  const [myRefIdsRows, myNoteIdsRows, myProjectIdsRows, myUpdateIdsRows] =
    await Promise.all([
      fetchSafe<{ id: string }>(
        supabase.from("refs").select("id").eq("created_by", me),
      ),
      fetchSafe<{ id: string }>(
        supabase.from("notes").select("id").eq("author", me),
      ),
      fetchSafe<{ id: string }>(
        supabase.from("projects").select("id").eq("created_by", me),
      ),
      fetchSafe<{ id: string }>(
        supabase.from("project_updates").select("id").eq("created_by", me),
      ),
    ]);
  const myRefIds = myRefIdsRows.map((r) => r.id);
  const myNoteIds = myNoteIdsRows.map((n) => n.id);
  const myProjectIds = myProjectIdsRows.map((p) => p.id);
  const myUpdateIds = myUpdateIdsRows.map((u) => u.id);
  if (
    myRefIds.length === 0 &&
    myNoteIds.length === 0 &&
    myProjectIds.length === 0 &&
    myUpdateIds.length === 0
  ) {
    return [];
  }

  type AnnotationRow = {
    id: string;
    ref_id: string;
    body: string;
    author: string;
    created_at: string;
    refs: EmbeddedRef | EmbeddedRef[] | null;
  };
  type RatingRow = {
    ref_id: string;
    user_key: string;
    stars: number;
    rated_at: string;
    refs: EmbeddedRef | EmbeddedRef[] | null;
  };

  const [
    notesOnMyRefs,
    notesOnMyProjects,
    notesOnMyUpdates,
    repliesToMyNotes,
    annotationRows,
    ratingRows,
  ] = await Promise.all([
    myRefIds.length > 0
      ? fetchSafe<NoteRowRich>(
          supabase
            .from("notes")
            .select(NOTE_EMBED)
            .in("ref_id", myRefIds)
            .neq("author", me)
            .order("created_at", { ascending: false })
            .limit(limit),
        )
      : Promise.resolve([] as NoteRowRich[]),
    myProjectIds.length > 0
      ? fetchSafe<NoteRowRich>(
          supabase
            .from("notes")
            .select(NOTE_EMBED)
            .in("project_id", myProjectIds)
            .neq("author", me)
            .order("created_at", { ascending: false })
            .limit(limit),
        )
      : Promise.resolve([] as NoteRowRich[]),
    myUpdateIds.length > 0
      ? fetchSafe<NoteRowRich>(
          supabase
            .from("notes")
            .select(NOTE_EMBED)
            .in("project_update_id", myUpdateIds)
            .neq("author", me)
            .order("created_at", { ascending: false })
            .limit(limit),
        )
      : Promise.resolve([] as NoteRowRich[]),
    myNoteIds.length > 0
      ? fetchSafe<NoteRowRich>(
          supabase
            .from("notes")
            .select(NOTE_EMBED)
            .in("parent_id", myNoteIds)
            .neq("author", me)
            .order("created_at", { ascending: false })
            .limit(limit),
        )
      : Promise.resolve([] as NoteRowRich[]),
    myRefIds.length > 0
      ? fetchSafe<AnnotationRow>(
          supabase
            .from("ref_annotations")
            .select(
              "id, ref_id, body, author, created_at, refs(id, title, image_path)",
            )
            .in("ref_id", myRefIds)
            .neq("author", me)
            .order("created_at", { ascending: false })
            .limit(limit),
        )
      : Promise.resolve([] as AnnotationRow[]),
    myRefIds.length > 0
      ? fetchSafe<RatingRow>(
          supabase
            .from("ref_ratings")
            .select(
              "ref_id, user_key, stars, rated_at, refs(id, title, image_path)",
            )
            .in("ref_id", myRefIds)
            .neq("user_key", me)
            .order("rated_at", { ascending: false })
            .limit(limit),
        )
      : Promise.resolve([] as RatingRow[]),
  ]);

  const items: ActivityItem[] = [];
  const seenNoteIds = new Set<string>();

  function pushNote(n: NoteRowRich, reason: ActivityItem["reason"]) {
    if (seenNoteIds.has(n.id)) return;
    const targets = noteTargets(n);
    if (!targets) return;
    seenNoteIds.add(n.id);
    items.push({
      kind: n.parent_id ? "reply" : "note",
      at: n.created_at,
      actor: n.author,
      ...targets,
      noteId: n.id,
      bodySnippet: (n.body ?? n.pros ?? n.cons ?? "").slice(0, 80),
      reason,
    });
  }

  // Replies to my notes are the most specific reason; prefer that framing
  // over "comment on my X" if a row matches both.
  for (const n of repliesToMyNotes) pushNote(n, "reply_to_me");
  for (const n of notesOnMyRefs) pushNote(n, "my_ref");
  for (const n of notesOnMyProjects) pushNote(n, "my_project");
  for (const n of notesOnMyUpdates) pushNote(n, "my_update");

  for (const a of annotationRows) {
    const ref = pickRef(a.refs);
    if (!ref) continue;
    items.push({
      kind: "annotation",
      at: a.created_at,
      actor: a.author,
      refTarget: ref,
      annotationId: a.id,
      bodySnippet: (a.body ?? "").slice(0, 80),
      reason: "my_ref",
    });
  }

  for (const r of ratingRows) {
    const ref = pickRef(r.refs);
    if (!ref) continue;
    items.push({
      kind: "rating",
      at: r.rated_at,
      actor: r.user_key,
      refTarget: ref,
      stars: r.stars,
      reason: "my_ref",
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

// Notifications archive — full feed of what the bell shows. Cursor-based
// pagination on created_at descending; pass `before` to load older rows.
export async function fetchNotificationsFor(
  recipient: string,
  opts: { limit?: number; before?: string } = {},
): Promise<Notification[]> {
  const supabase = await createClient();
  const limit = opts.limit ?? 60;
  let q = supabase
    .from("notifications")
    .select("*")
    .eq("recipient", recipient)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.before) q = q.lt("created_at", opts.before);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as Notification[];
}

// Active announcements (expires_at in the future), newest first. The
// index banner renders all of them stacked.
export async function fetchActiveAnnouncements(): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as Announcement[];
}

// Calendar events overlapping a (closed-open) date window. Includes any
// multi-day event whose ends_at extends into the window even if starts_at
// is before it, so a project that began last month still draws across the
// visible cells this month.
export async function fetchEventsBetween(
  fromIso: string,
  toIso: string,
): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .lt("starts_at", toIso)
    .or(`ends_at.gte.${fromIso},and(ends_at.is.null,starts_at.gte.${fromIso})`)
    .order("starts_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as CalendarEvent[];
}
