// Domain types matching the Supabase schema (see db/schema.sql).

export const GENRES = [
  "editorial",
  "poster",
  "identity",
  "type",
  "packaging",
  "web",
  "motion",
  "exhibition",
  "etc",
] as const;
export type Genre = (typeof GENRES)[number];

export const MEDIUMS = [
  "print",
  "screen",
  "spatial",
  "object",
  "mixed",
] as const;
export type Medium = (typeof MEDIUMS)[number];

export const LANGUAGES = ["ko", "en", "ja", "zh", "etc"] as const;
export type Language = (typeof LANGUAGES)[number];

export const REF_SORTS = [
  "latest",
  "rating",
  "year_desc",
  "year_asc",
] as const;
export type RefSort = (typeof REF_SORTS)[number];

export type Designer = {
  id: string;
  slug: string;
  name: string;
  origin: string | null;
  website: string | null;
  bio: string | null;
  created_at: string;
  created_by: string | null;
};

export type Ref = {
  id: string;
  title: string | null;
  year: number | null;
  source_url: string | null;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  genre: Genre | null;
  medium: Medium | null;
  languages: Language[];
  tags: string[];
  notes_count: number;
  created_at: string;
  created_by: string | null;
  color_hex: string | null;
  color_hue: number | null;
  ocr_text: string | null;
};

export type RefImage = {
  id: string;
  ref_id: string;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  position: number;
  created_at: string;
};

export type RefWithDesigners = Ref & {
  designers: Pick<Designer, "id" | "slug" | "name">[];
  rating_avg: number | null;
  rating_count: number;
  extra_image_count: number;
};

export type RefRating = {
  ref_id: string;
  user_key: string;
  stars: number;
  rated_at: string;
};

export const NOTE_KINDS = ["discussion", "decision", "open_question"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export type Note = {
  id: string;
  ref_id: string | null;
  project_id: string | null;
  project_update_id: string | null;
  parent_id: string | null;
  body: string | null;
  pros: string | null;
  cons: string | null;
  image_paths: string[];
  kind: NoteKind;
  author: string;
  created_at: string;
  updated_at: string;
};

export const PROJECT_STATUSES = ["planning", "in_progress", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectRole = {
  person: string;
  role: string;
  is_leader?: boolean;
};

// One row of the success metrics grid: what we measure, what we want it
// to be, and roughly when. All optional past `metric` so partial entries
// (e.g. a metric we haven't picked a target for yet) are still saveable.
export type SuccessMetric = {
  metric: string;
  target?: string;
  by_when?: string;
};

export type ProjectPlanning = {
  concept?: string;
  problem?: string;
  audience?: string;
  positive_keywords?: string[];
  negative_keywords?: string[];
  roles?: ProjectRole[];
  success_metrics?: SuccessMetric[];
  constraints?: string;
  deliverables?: string;
  // Legacy: pre-split single tone keyword list. Read-migrated into
  // positive_keywords by readPlanning(); never written back.
  tone?: string[];
};

export const PLANNING_TEXT_SECTIONS = [
  "concept",
  "problem",
  "audience",
  "constraints",
  "deliverables",
] as const;
export type PlanningTextSection = (typeof PLANNING_TEXT_SECTIONS)[number];

export const PLANNING_KEYWORD_SECTIONS = [
  "positive_keywords",
  "negative_keywords",
] as const;
export type PlanningKeywordSection =
  (typeof PLANNING_KEYWORD_SECTIONS)[number];

export type Project = {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  planning: ProjectPlanning;
  planning_updated_at: string | null;
  planning_updated_by: string | null;
  created_at: string;
  created_by: string | null;
};

export type ProjectPositioningMap = {
  id: string;
  project_id: string;
  name: string | null;
  x_low_label: string | null;
  x_high_label: string | null;
  y_low_label: string | null;
  y_high_label: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type ProjectPositioningPoint = {
  id: string;
  project_id: string;
  map_id: string | null;
  ref_id: string | null;
  label: string | null;
  x: number;
  y: number;
  is_self: boolean;
  color: string | null;
  created_at: string;
  created_by: string | null;
};

export type ProjectUpdate = {
  id: string;
  project_id: string;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  body: string | null;
  created_at: string;
  created_by: string | null;
};

export type UpdateReaction = {
  project_update_id: string;
  user_key: string;
  emoji: string;
  reacted_at: string;
};

export type Announcement = {
  id: string;
  body: string;
  created_by: string;
  created_at: string;
  expires_at: string;
};

export const EVENT_KINDS = ["general", "milestone"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type CalendarEvent = {
  id: string;
  project_id: string | null;
  title: string;
  body: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  announce: boolean;
  kind: EventKind;
  assignee: string | null;
  created_at: string;
  created_by: string | null;
};

// What a Note is about. Replies use the same target as their parent.
export type NoteTarget =
  | { kind: "ref"; id: string }
  | { kind: "project"; id: string }
  | { kind: "project_update"; id: string };

export type RefAnnotation = {
  id: string;
  ref_id: string | null;
  ref_image_id: string | null;
  project_update_id: string | null;
  kind: "point" | "area";
  x_pct: number;
  y_pct: number;
  w_pct: number | null;
  h_pct: number | null;
  body: string;
  author: string;
  created_at: string;
  updated_at: string;
};

export type AnnotationTarget =
  | { kind: "ref"; id: string }
  | { kind: "ref_image"; id: string }
  | { kind: "project_update"; id: string };

// Join-row helper used when inserting after upload.
export type RefDesigner = {
  ref_id: string;
  designer_id: string;
};

export type Board = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  created_by: string | null;
};

export const NOTIFICATION_KINDS = [
  "note",
  "reply",
  "annotation",
  "rating",
  "ref_upload",
  "project_update",
  "ref_link",
  "update_ref_link",
  "event_create",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Notification = {
  id: string;
  recipient: string;
  actor: string | null;
  kind: NotificationKind;
  target_type: string;
  target_id: string;
  body: string | null;
  link: string;
  read_at: string | null;
  created_at: string;
};
