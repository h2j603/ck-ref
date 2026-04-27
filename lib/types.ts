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

export const REF_SORTS = ["latest", "rating", "year"] as const;
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

export type Note = {
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
  updated_at: string;
};

export const PROJECT_STATUSES = ["in_progress", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Project = {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
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
