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

export const REF_SORTS = ["latest", "rating", "popular"] as const;
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

export type RefWithDesigners = Ref & {
  designers: Pick<Designer, "id" | "slug" | "name">[];
  rating_avg: number | null;
  rating_count: number;
};

export type RefRating = {
  ref_id: string;
  user_key: string;
  stars: number;
  rated_at: string;
};

export type Note = {
  id: string;
  ref_id: string;
  body: string | null;
  pros: string | null;
  cons: string | null;
  author: string;
  created_at: string;
  updated_at: string;
};

export type RefAnnotation = {
  id: string;
  ref_id: string;
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
