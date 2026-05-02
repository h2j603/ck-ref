-- KIWI Juice — Supabase schema
-- Run this in the Supabase SQL editor.
-- This is a v1 schema. RLS is left permissive because the app gates access
-- via a single shared password at the proxy layer.

create extension if not exists "pgcrypto";

-- pgvector backs the visual-similarity reranker on /ref/<id>. If the
-- extension isn't installed (managed Postgres setups sometimes gate it),
-- the embedding column below stays NULL and similar refs fall back to the
-- metadata-only score path. Safe to skip if pgvector isn't available.
create extension if not exists vector;

-- PROFILES ------------------------------------------------------------------
-- Fixed roster of three known users. `key` is the immutable identifier and
-- matches what we store in localStorage and in created_by columns; only
-- display_name + avatar_path are editable. The seed runs once via on-conflict.

create table if not exists profiles (
  key           text primary key,
  display_name  text not null,
  avatar_path   text,
  color         text not null default '#a8a29e',
  password_hash text,
  updated_at    timestamptz not null default now()
);

-- Existing deployments: the column was added later. Idempotent.
alter table profiles add column if not exists password_hash text;

insert into profiles (key, display_name, color) values
  ('하진', '하진', '#e9c46a'),
  ('미주', '미주', '#48cae4'),
  ('혁',   '혁',   '#e879c2')
on conflict (key) do nothing;

-- WIP / PROJECTS ------------------------------------------------------------
-- A `project` is one of our own works in progress. Updates are the time-
-- ordered shots/posts under it; project_refs links inspiration refs.
-- Discussion (notes/replies) attaches to projects and updates via the
-- polymorphic columns added to `notes` further down.

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      text not null default 'planning' check (status in ('planning', 'in_progress', 'done')),
  -- Free-form planning notes. Sections are { concept, problem, audience,
  -- tone (string[]), constraints, deliverables }; we keep them in jsonb so
  -- adding/removing sections is a code-only change. Empty `{}` means the
  -- planning view shows just the prompts.
  planning    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  text
);

-- Existing deployments: planning column added later, and the status check
-- needs to accept the new value. Both idempotent.
alter table projects add column if not exists planning jsonb not null default '{}'::jsonb;
-- Track who last touched the planning brief, for the "@미주 · 12분 전 수정"
-- footer. Updated by the client on every planning persist.
alter table projects add column if not exists planning_updated_at timestamptz;
alter table projects add column if not exists planning_updated_by text;
do $$
begin
  alter table projects drop constraint if exists projects_status_check;
  alter table projects add constraint projects_status_check
    check (status in ('planning', 'in_progress', 'done'));
exception when others then null;
end $$;

create index if not exists projects_status_idx     on projects (status);
create index if not exists projects_created_at_idx on projects (created_at desc);
create index if not exists projects_created_by_idx on projects (created_by);

-- Positioning map. Originally one map per project (project_positioning);
-- v2 adds project_positioning_maps so a project can carry several maps
-- (e.g. brand vs. tone), each with its own axis pair and points. The old
-- single-row table stays around for the migration block below; new code
-- writes only to the maps table.
create table if not exists project_positioning (
  project_id    uuid primary key references projects(id) on delete cascade,
  x_low_label   text,
  x_high_label  text,
  y_low_label   text,
  y_high_label  text,
  updated_at    timestamptz not null default now()
);

create table if not exists project_positioning_maps (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  -- Free-form display name. NULL renders as "(이름 없음)" in the UI.
  name          text,
  x_low_label   text,
  x_high_label  text,
  y_low_label   text,
  y_high_label  text,
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists project_positioning_maps_project_idx
  on project_positioning_maps (project_id, position);

-- One-time migration: lift each project's single positioning row into the
-- new maps table. Skipped on subsequent runs because the where-not-exists
-- guard finds the migrated row.
insert into project_positioning_maps (project_id, name, x_low_label, x_high_label, y_low_label, y_high_label, position)
select project_id, null, x_low_label, x_high_label, y_low_label, y_high_label, 0
from project_positioning op
where not exists (
  select 1 from project_positioning_maps m where m.project_id = op.project_id
);

create table if not exists project_positioning_points (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  -- Optional ref link. When set, the UI draws the ref thumbnail at (x, y);
  -- label is used as the caption. Refs deleted while linked: drop to NULL.
  ref_id      uuid references refs(id) on delete set null,
  label       text,
  -- Normalised coordinates in [-1, 1]; (0, 0) is the center of the map.
  x           real not null,
  y           real not null,
  is_self     boolean not null default false,
  color       text,
  created_at  timestamptz not null default now(),
  created_by  text
);

-- v2: points belong to a specific map. Existing rows get backfilled to
-- the project's first/only map below; new inserts always set map_id.
alter table project_positioning_points
  add column if not exists map_id uuid references project_positioning_maps(id) on delete cascade;

update project_positioning_points p
set map_id = (
  select m.id from project_positioning_maps m
  where m.project_id = p.project_id
  order by m.position, m.created_at
  limit 1
)
where p.map_id is null
  and exists (select 1 from project_positioning_maps m where m.project_id = p.project_id);

create index if not exists project_positioning_points_project_idx
  on project_positioning_points (project_id);
create index if not exists project_positioning_points_map_idx
  on project_positioning_points (map_id);
create index if not exists project_positioning_points_ref_idx
  on project_positioning_points (ref_id);

create table if not exists project_updates (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  image_path   text not null,
  image_width  int,
  image_height int,
  body         text,
  created_at   timestamptz not null default now(),
  created_by   text
);

create index if not exists project_updates_project_idx
  on project_updates (project_id, created_at desc);

create table if not exists project_refs (
  project_id uuid not null references projects(id) on delete cascade,
  ref_id     uuid not null references refs(id) on delete cascade,
  reason     text,
  added_at   timestamptz not null default now(),
  added_by   text,
  primary key (project_id, ref_id)
);

-- Existing deployments: column added later. Idempotent.
alter table project_refs add column if not exists reason text;

create index if not exists project_refs_ref_idx on project_refs (ref_id);

-- Per-update inspiration. Same shape as project_refs but scoped to one
-- specific update (image post) instead of the whole project. The two are
-- independent — a ref can be on the project's overall pool, on a single
-- update, or both.
create table if not exists project_update_refs (
  project_update_id uuid not null references project_updates(id) on delete cascade,
  ref_id            uuid not null references refs(id) on delete cascade,
  reason            text,
  added_at          timestamptz not null default now(),
  added_by          text,
  primary key (project_update_id, ref_id)
);

create index if not exists project_update_refs_ref_idx on project_update_refs (ref_id);

-- BOARDS (moodboards) -------------------------------------------------------
-- A board is a curated collection of refs. Anyone with a nickname can add or
-- remove items from any board (3-person trust model); only the creator can
-- edit the board metadata or delete the board itself.

create table if not exists boards (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text,
  positive_keywords  text[] not null default '{}',
  negative_keywords  text[] not null default '{}',
  playlist_url       text,
  -- Brian Eno's Oblique Strategies cards the team has pinned to this
  -- board. Multiple allowed — non-visual prompts to keep the moodboard
  -- from collapsing into pure visual fixation.
  oblique_cards      text[] not null default '{}',
  -- Pairing brief: "A × B" headline (e.g. "Helvetica × bossa nova").
  pairing_a          text,
  pairing_b          text,
  created_at         timestamptz not null default now(),
  created_by         text
);

create index if not exists boards_created_at_idx on boards (created_at desc);
create index if not exists boards_created_by_idx on boards (created_by);

-- Old single-bucket keywords column → positive_keywords. Idempotent
-- so re-running schema.sql after the rename is safe.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'boards' and column_name = 'keywords'
  ) then
    alter table boards rename column keywords to positive_keywords;
  end if;
end $$;
alter table boards add column if not exists positive_keywords text[] not null default '{}';
alter table boards add column if not exists negative_keywords text[] not null default '{}';
alter table boards add column if not exists playlist_url text;
alter table boards add column if not exists oblique_cards text[] not null default '{}';
alter table boards add column if not exists pairing_a text;
alter table boards add column if not exists pairing_b text;
-- One-shot migration: previous `oblique_card text` (single) → array.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'boards' and column_name = 'oblique_card'
  ) then
    update boards
       set oblique_cards = array[oblique_card]
     where oblique_card is not null
       and (array_length(oblique_cards, 1) is null);
    alter table boards drop column oblique_card;
  end if;
end $$;

create table if not exists board_items (
  board_id  uuid not null references boards(id) on delete cascade,
  ref_id    uuid not null references refs(id) on delete cascade,
  position  int not null default 0,
  -- 0 = unrated, 1..5 = how well this ref fits the brief. The card
  -- border in the moodboard tints based on this so the curator can
  -- read fit at a glance without opening anything.
  fit       smallint not null default 0 check (fit between 0 and 5),
  added_at  timestamptz not null default now(),
  added_by  text,
  primary key (board_id, ref_id)
);

create index if not exists board_items_board_idx on board_items (board_id, position);
create index if not exists board_items_ref_idx on board_items (ref_id);

alter table board_items add column if not exists fit smallint not null default 0;
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'board_items' and column_name = 'fit'
  ) then
    alter table board_items add constraint board_items_fit_check
      check (fit between 0 and 5);
  end if;
end $$;

-- DESIGNERS -----------------------------------------------------------------

create table if not exists designers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  origin      text,
  website     text,
  bio         text,
  created_at  timestamptz not null default now(),
  created_by  text
);

create index if not exists designers_name_idx on designers using gin (to_tsvector('simple', name));

-- REFS ----------------------------------------------------------------------

create table if not exists refs (
  id            uuid primary key default gen_random_uuid(),
  title         text,
  year          int,
  source_url    text,
  image_path    text not null,
  image_width   int,
  image_height  int,
  genre         text,
  medium        text,
  languages     text[] not null default '{}',
  tags          text[] not null default '{}',
  notes_count   int    not null default 0,
  created_at    timestamptz not null default now(),
  created_by    text
);

create index if not exists refs_created_at_idx on refs (created_at desc);
create index if not exists refs_tags_idx       on refs using gin (tags);
create index if not exists refs_languages_idx  on refs using gin (languages);
create index if not exists refs_genre_idx      on refs (genre);
create index if not exists refs_medium_idx     on refs (medium);

-- Multi-genre support. Original `genre` was a single text column; copy
-- existing values into the array, drop the scalar column. Idempotent.
alter table refs add column if not exists genres text[] not null default '{}';
update refs set genres = array[genre]
  where genre is not null and (genres is null or array_length(genres, 1) is null);
alter table refs drop column if exists genre;
create index if not exists refs_genres_idx on refs using gin (genres);

-- Dominant color extracted client-side at upload. color_hex is for display,
-- color_hue (0-359) for cheap range filters; NULL hue = greyscale/neutral.
alter table refs add column if not exists color_hex text;
alter table refs add column if not exists color_hue smallint;
-- Tesseract.js OCR run client-side at upload. Stores any text the model
-- found in the image so we can search by poster copy / book title without
-- the user having to retype it.
alter table refs add column if not exists ocr_text text;
-- Refs uploaded straight into a moodboard get this flag so they stay
-- scoped to their board and don't leak into the global index, search,
-- or other pickers. The board they belong to still surfaces them via
-- board_items.
alter table refs add column if not exists board_only boolean not null default false;
create index if not exists refs_color_hue_idx on refs (color_hue);
create index if not exists refs_board_only_idx on refs (board_only) where board_only = false;

-- CLIP image embedding. Computed server-side via the embedding provider
-- after upload; NULL until the backfill / async job catches up. Existing
-- deployments without pgvector skip this gracefully.
--
-- Default dimension is 768 to match Jina jina-clip-v1, our fallback
-- provider after Hugging Face's free serverless turned out to be too
-- flaky to rely on. If you swap providers in env, set EMBEDDING_DIM and
-- re-run this block — it'll resize the column when no rows are populated.
do $$
declare
  has_data boolean;
begin
  if not exists (select 1 from pg_extension where extname = 'vector') then
    return;
  end if;
  -- Add the column at the target dim if it doesn't exist yet.
  execute 'alter table refs add column if not exists embedding vector(768)';

  -- If the existing column is at a different dim and nothing has been
  -- embedded yet, resize. We don't try to re-embed surviving rows; that
  -- isn't safe in SQL alone.
  select exists(select 1 from refs where embedding is not null) into has_data;
  if not has_data then
    execute 'drop index if exists refs_embedding_idx';
    execute 'alter table refs drop column if exists embedding';
    execute 'alter table refs add column embedding vector(768)';
  end if;

  execute 'create index if not exists refs_embedding_idx on refs using hnsw (embedding vector_cosine_ops)';
end $$;

-- Cosine-similarity nearest-neighbor lookup, called from the server via
-- supabase.rpc(). Returns an empty set when pgvector is missing or no
-- embeddings exist yet; the caller falls back to metadata scoring.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    -- Use the unsized vector type for the parameter so the function works
    -- regardless of which embedding model the app is currently configured
    -- for. The cosine operator still requires both sides to match the
    -- column's dimension at call time.
    execute $f$
      create or replace function similar_refs_by_embedding(
        query_embedding vector,
        match_count int,
        exclude_id uuid
      )
      returns table (id uuid, similarity double precision)
      language sql
      stable
      as $body$
        select id, 1 - (embedding <=> query_embedding)::double precision as similarity
        from refs
        where embedding is not null
          and id <> exclude_id
        order by embedding <=> query_embedding
        limit match_count
      $body$
    $f$;
  end if;
end $$;

-- REF <-> DESIGNER ----------------------------------------------------------

create table if not exists ref_designers (
  ref_id      uuid not null references refs(id) on delete cascade,
  designer_id uuid not null references designers(id) on delete cascade,
  primary key (ref_id, designer_id)
);

create index if not exists ref_designers_designer_idx on ref_designers (designer_id);

-- NOTES ---------------------------------------------------------------------

create table if not exists notes (
  id                uuid primary key default gen_random_uuid(),
  ref_id            uuid references refs(id) on delete cascade,
  project_id        uuid references projects(id) on delete cascade,
  project_update_id uuid references project_updates(id) on delete cascade,
  parent_id         uuid references notes(id) on delete cascade,
  body              text,
  pros              text,
  cons              text,
  image_paths       text[] not null default '{}',
  author            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Migrations for already-deployed envs.
alter table notes add column if not exists pros text;
alter table notes add column if not exists cons text;
alter table notes add column if not exists parent_id uuid references notes(id) on delete cascade;
alter table notes add column if not exists project_id uuid references projects(id) on delete cascade;
alter table notes add column if not exists project_update_id uuid references project_updates(id) on delete cascade;
alter table notes add column if not exists image_paths text[] not null default '{}';
-- Three "shapes" of note: regular discussion (default), a recorded
-- decision, or an open question awaiting an answer. We surface counts of
-- the latter two on the project header so they don't get lost in a long
-- thread.
alter table notes add column if not exists kind text not null default 'discussion';
do $$
begin
  alter table notes drop constraint if exists notes_kind_check;
  alter table notes add constraint notes_kind_check
    check (kind in ('discussion', 'decision', 'open_question'));
exception when others then null;
end $$;
create index if not exists notes_kind_idx on notes (kind);
alter table notes alter column body drop not null;
alter table notes alter column ref_id drop not null;

-- Optional analysis facet for ref-targeted notes. Lets us tag a note as
-- being about a specific dimension of the design (typography, layout, …)
-- so the detail page can group / filter by facet without forcing a
-- structured form. Nullable: notes that don't fit a facet (general
-- discussion) leave it as NULL. `etc` is the catch-all facet — pairs
-- with `facet_label` for the user-entered label.
alter table notes add column if not exists facet text;
alter table notes add column if not exists facet_label text;
do $$
begin
  alter table notes drop constraint if exists notes_facet_check;
  alter table notes add constraint notes_facet_check
    check (facet is null or facet in ('composition', 'type', 'material', 'etc'));
exception when others then null;
end $$;
create index if not exists notes_facet_idx on notes (facet);

-- Exactly one of (ref_id, project_id, project_update_id) must be set so we
-- always know what the note is "about". The fkey + this check together act
-- as a discriminated target.
alter table notes drop constraint if exists notes_target_check;
alter table notes add constraint notes_target_check check (
  (ref_id is not null)::int +
  (project_id is not null)::int +
  (project_update_id is not null)::int = 1
);

create index if not exists notes_ref_idx           on notes (ref_id, created_at desc);
create index if not exists notes_project_idx       on notes (project_id, created_at desc);
create index if not exists notes_update_idx        on notes (project_update_id, created_at desc);
create index if not exists notes_parent_idx        on notes (parent_id);

-- Maintain refs.notes_count -------------------------------------------------

create or replace function bump_notes_count() returns trigger language plpgsql as $$
begin
  -- Only refs maintain a denormalized count; project / update notes are
  -- counted on read.
  if (tg_op = 'INSERT' and new.ref_id is not null) then
    update refs set notes_count = notes_count + 1 where id = new.ref_id;
  elsif (tg_op = 'DELETE' and old.ref_id is not null) then
    update refs set notes_count = greatest(notes_count - 1, 0) where id = old.ref_id;
  end if;
  return null;
end;
$$;

drop trigger if exists notes_count_trigger on notes;
create trigger notes_count_trigger
after insert or delete on notes
for each row execute procedure bump_notes_count();

-- Touch updated_at on note edits --------------------------------------------

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_touch_trigger on notes;
create trigger notes_touch_trigger
before update on notes
for each row execute procedure touch_updated_at();

-- REF ANNOTATIONS -----------------------------------------------------------
-- Pinned comments anchored to a specific spot on a ref's image. Coordinates
-- are stored as percentages so they survive any image resize / aspect at
-- render time. Author is the profile key; the same trust model as notes.

create table if not exists ref_annotations (
  id                uuid primary key default gen_random_uuid(),
  ref_id            uuid references refs(id) on delete cascade,
  ref_image_id      uuid references ref_images(id) on delete cascade,
  project_update_id uuid references project_updates(id) on delete cascade,
  kind              text not null default 'point' check (kind in ('point', 'area')),
  x_pct             numeric not null check (x_pct >= 0 and x_pct <= 100),
  y_pct             numeric not null check (y_pct >= 0 and y_pct <= 100),
  w_pct             numeric check (w_pct is null or (w_pct > 0 and w_pct <= 100)),
  h_pct             numeric check (h_pct is null or (h_pct > 0 and h_pct <= 100)),
  body              text not null,
  author            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Existing deployments: idempotent column adds + nullability + a check that
-- exactly one target is set so each annotation belongs to exactly one image.
alter table ref_annotations add column if not exists kind text not null default 'point';
alter table ref_annotations add column if not exists w_pct numeric;
alter table ref_annotations add column if not exists h_pct numeric;
alter table ref_annotations add column if not exists project_update_id uuid references project_updates(id) on delete cascade;
alter table ref_annotations add column if not exists ref_image_id uuid references ref_images(id) on delete cascade;
alter table ref_annotations alter column ref_id drop not null;
alter table ref_annotations drop constraint if exists ref_annotations_target_check;
alter table ref_annotations add constraint ref_annotations_target_check check (
  (ref_id is not null)::int
  + (ref_image_id is not null)::int
  + (project_update_id is not null)::int = 1
);

create index if not exists ref_annotations_ref_idx       on ref_annotations (ref_id, created_at desc);
create index if not exists ref_annotations_ref_image_idx on ref_annotations (ref_image_id, created_at desc);
create index if not exists ref_annotations_update_idx    on ref_annotations (project_update_id, created_at desc);

-- REF EXTRA IMAGES ----------------------------------------------------------
-- A ref can be a series. The first image lives on `refs` itself (the cover);
-- extra images live here in display order. Empty for single-image refs.

create table if not exists ref_images (
  id           uuid primary key default gen_random_uuid(),
  ref_id       uuid not null references refs(id) on delete cascade,
  image_path   text not null,
  image_width  int,
  image_height int,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists ref_images_ref_idx on ref_images (ref_id, position);

-- REF RATINGS ---------------------------------------------------------------
-- Each user (profile key) can rate a ref 1-5 once. Re-rating is an upsert
-- on the composite key; un-rating is just a delete of that row. Average +
-- count are computed in the queries.

create table if not exists ref_ratings (
  ref_id    uuid not null references refs(id) on delete cascade,
  user_key  text not null,
  stars     int not null check (stars between 1 and 5),
  rated_at  timestamptz not null default now(),
  primary key (ref_id, user_key)
);

create index if not exists ref_ratings_ref_idx on ref_ratings (ref_id);

-- UPDATE REACTIONS ----------------------------------------------------------
-- Emoji reactions on WIP project_updates. Same trust model as everywhere
-- else: nickname (profile key) in localStorage drives identity. PK is
-- (update, user, emoji) so a user can react with multiple different emojis
-- on the same update; clicking the same emoji again deletes the row.

create table if not exists update_reactions (
  project_update_id uuid not null references project_updates(id) on delete cascade,
  user_key          text not null,
  emoji             text not null,
  reacted_at        timestamptz not null default now(),
  primary key (project_update_id, user_key, emoji)
);

create index if not exists update_reactions_update_idx
  on update_reactions (project_update_id);

-- REF <-> REF LINKS ---------------------------------------------------------
-- Undirected links between refs. Stored as a canonical pair (smaller uuid in
-- a_id) so each link appears exactly once; the check constraint enforces it
-- and the client/queries canonicalize before insert.

create table if not exists ref_links (
  a_id        uuid not null references refs(id) on delete cascade,
  b_id        uuid not null references refs(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  text,
  primary key (a_id, b_id),
  check (a_id < b_id)
);

create index if not exists ref_links_b_idx on ref_links (b_id);

-- CALENDAR EVENTS -----------------------------------------------------------
-- Lightweight events for the team calendar. Each event optionally pins to a
-- WIP project so the calendar can color-code by project. project_id is
-- nullable for "personal" events; cascade on delete so removing a project
-- clears its events. Times are stored as timestamptz; for all_day events the
-- client treats starts_at as the local-midnight of the day.

create table if not exists events (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete cascade,
  title             text not null,
  body              text,
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  all_day           boolean not null default false,
  notified_morning  boolean not null default false,
  notified_hour     boolean not null default false,
  announce          boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        text
);

-- Existing deployments — idempotent column adds for the reminder flags
-- and the index-banner opt-in (default off so noisy long-running plans
-- don't auto-pin themselves to the index).
alter table events add column if not exists notified_morning boolean not null default false;
alter table events add column if not exists notified_hour    boolean not null default false;
alter table events add column if not exists announce         boolean not null default false;
-- v2: events grew a `kind` so the planning page can surface project
-- milestones inline while keeping the same row visible on the calendar.
-- 'general' is the default; 'milestone' marks a planning checkpoint.
alter table events add column if not exists kind text not null default 'general';
-- Optional assignee — currently only milestones use it. Stores a
-- profile.key (the same string we put in created_by) so the reminder
-- can call out who's responsible. Free text rather than a FK so a typo
-- never blocks a save.
alter table events add column if not exists assignee text;
do $$
begin
  alter table events drop constraint if exists events_kind_check;
  alter table events add constraint events_kind_check
    check (kind in ('general', 'milestone'));
exception when others then null;
end $$;
create index if not exists events_kind_idx on events (kind);

create index if not exists events_starts_idx  on events (starts_at);
create index if not exists events_project_idx on events (project_id);

-- ANNOUNCEMENTS -------------------------------------------------------------
-- Short broadcast messages from one team member to the whole index. Each
-- has a hard expires_at (set at create time from a duration picker —
-- 1h/6h/1d/1w); after that the index banner stops rendering it. Authors
-- can also delete their own early.

create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists announcements_expires_idx
  on announcements (expires_at desc);

alter table announcements enable row level security;
drop policy if exists "anon all" on announcements;
create policy "anon all" on announcements
  for all to anon, authenticated using (true) with check (true);

-- IN-APP NOTIFICATIONS ------------------------------------------------------
-- One row per (recipient, event). The Discord webhook handler is the single
-- source — when an event fires, it posts to Discord AND inserts a row here
-- for every team member that isn't the actor. read_at is per recipient so
-- each profile tracks their own inbox.

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient   text not null,
  actor       text,
  kind        text not null check (kind in (
    'note', 'reply', 'annotation', 'rating', 'ref_upload', 'project_update',
    'ref_link', 'update_ref_link', 'event_create'
  )),
  target_type text not null,
  target_id   uuid not null,
  body        text,
  link        text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Existing deployments: relax the kind constraint to admit the two new
-- ref-attachment kinds. Idempotent.
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in (
    'note', 'reply', 'annotation', 'rating', 'ref_upload', 'project_update',
    'ref_link', 'update_ref_link', 'event_create'
  ));

create index if not exists notifications_recipient_idx
  on notifications (recipient, created_at desc);
create index if not exists notifications_unread_idx
  on notifications (recipient) where read_at is null;

-- RLS POLICIES --------------------------------------------------------------
-- Supabase enables RLS by default on tables exposed via PostgREST. Without
-- policies, anon-key inserts are rejected with "new row violates row-level
-- security policy". This app gates access at the proxy layer (single shared
-- password), so we expose permissive policies for anon + authenticated.

alter table profiles        enable row level security;
alter table projects        enable row level security;
alter table project_updates enable row level security;
alter table project_refs    enable row level security;
alter table project_update_refs enable row level security;
alter table project_positioning enable row level security;
alter table project_positioning_maps enable row level security;
alter table project_positioning_points enable row level security;
alter table boards          enable row level security;
alter table board_items     enable row level security;
alter table designers       enable row level security;
alter table refs          enable row level security;
alter table ref_designers   enable row level security;
alter table ref_images      enable row level security;
alter table ref_ratings     enable row level security;
alter table update_reactions enable row level security;
alter table ref_annotations enable row level security;
alter table ref_links       enable row level security;
alter table notes         enable row level security;
alter table notifications enable row level security;
alter table events        enable row level security;

drop policy if exists "anon all" on profiles;
create policy "anon all" on profiles
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on projects;
create policy "anon all" on projects
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on project_updates;
create policy "anon all" on project_updates
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on project_refs;
create policy "anon all" on project_refs
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on project_update_refs;
create policy "anon all" on project_update_refs
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on project_positioning;
create policy "anon all" on project_positioning
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on project_positioning_maps;
create policy "anon all" on project_positioning_maps
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on project_positioning_points;
create policy "anon all" on project_positioning_points
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on boards;
create policy "anon all" on boards
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on board_items;
create policy "anon all" on board_items
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on designers;
create policy "anon all" on designers
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on refs;
create policy "anon all" on refs
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on ref_designers;
create policy "anon all" on ref_designers
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on ref_images;
create policy "anon all" on ref_images
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on ref_ratings;
create policy "anon all" on ref_ratings
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on update_reactions;
create policy "anon all" on update_reactions
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on ref_annotations;
create policy "anon all" on ref_annotations
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on ref_links;
create policy "anon all" on ref_links
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on notes;
create policy "anon all" on notes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on notifications;
create policy "anon all" on notifications
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on events;
create policy "anon all" on events
  for all to anon, authenticated using (true) with check (true);

-- REF GRIDS -----------------------------------------------------------------
-- Müller-Brockmann-style structural grids overlaid on poster refs. A ref
-- can have multiple named grids (e.g. one for typography blocks, one for
-- image modules) so saving doesn't force destructive overwrite when the
-- analysis evolves.
--
-- All margins/gutters are stored as fractions of image width / height so
-- they scale cleanly with display size and survive image swaps.
create table if not exists ref_grids (
  id            uuid primary key default gen_random_uuid(),
  ref_id        uuid not null references refs(id) on delete cascade,
  -- columnar = uniform vertical columns
  -- modular  = cols × rows of cells
  -- manuscript = single text block (margins only)
  -- custom   = user-drawn vertical/horizontal lines (positions in custom_lines)
  grid_type     text not null default 'columnar'
    check (grid_type in ('columnar', 'modular', 'manuscript', 'custom')),
  cols          int  not null default 6 check (cols  >= 1 and cols  <= 32),
  rowscount     int  not null default 1 check (rowscount >= 1 and rowscount <= 32),
  margin_top    numeric not null default 0.05,
  margin_right  numeric not null default 0.05,
  margin_bottom numeric not null default 0.05,
  margin_left   numeric not null default 0.05,
  gutter_x      numeric not null default 0.02,
  gutter_y      numeric not null default 0.02,
  -- Optional baseline grid spacing as fraction of image height. NULL = off.
  baseline      numeric,
  -- Custom grid only: arrays of fractional positions (0-1) within the
  -- content area for vertical / horizontal lines.
  custom_v      numeric[] not null default '{}',
  custom_h      numeric[] not null default '{}',
  label         text,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists ref_grids_ref_idx on ref_grids (ref_id, created_at);

-- Optional: which specific image of the ref the grid was drawn against.
-- NULL = the cover (refs.image_path). Otherwise a path matching one of
-- ref_images.image_path. Lets a ref with multiple images carry separate
-- grids per slide.
alter table ref_grids add column if not exists image_path text;

-- Bump cols/rowscount caps from 24 → 32 (Müller-Brockmann's largest
-- common modular grid). Idempotent — drops the old check then adds the
-- new one.
do $$
begin
  alter table ref_grids drop constraint if exists ref_grids_cols_check;
  alter table ref_grids drop constraint if exists ref_grids_rowscount_check;
  alter table ref_grids add constraint ref_grids_cols_check
    check (cols >= 1 and cols <= 32);
  alter table ref_grids add constraint ref_grids_rowscount_check
    check (rowscount >= 1 and rowscount <= 32);
exception when others then null;
end $$;
do $$
begin
  alter table project_grids drop constraint if exists project_grids_cols_check;
  alter table project_grids drop constraint if exists project_grids_rowscount_check;
  alter table project_grids add constraint project_grids_cols_check
    check (cols >= 1 and cols <= 32);
  alter table project_grids add constraint project_grids_rowscount_check
    check (rowscount >= 1 and rowscount <= 32);
exception when others then null;
end $$;

-- Stroke color for the grid overlay. Some refs (dark posters) need a
-- light stroke to be readable. Default 'dark' keeps existing rows on
-- the prior look.
alter table ref_grids add column if not exists color text not null
  default 'dark' check (color in ('dark','light'));

-- When a grid was created by copying an existing ref_grid, this tracks
-- the origin so the gallery can show "applied to N refs / N projects".
alter table ref_grids add column if not exists source_grid_id uuid
  references ref_grids(id) on delete set null;
create index if not exists ref_grids_source_idx on ref_grids (source_grid_id);

alter table ref_grids enable row level security;
drop policy if exists "anon all" on ref_grids;
create policy "anon all" on ref_grids
  for all to anon, authenticated using (true) with check (true);

-- PROJECT GRIDS -------------------------------------------------------------
-- A grid copied from a ref (or authored directly) onto a WIP project, used
-- as a starting structure for the team's own design work. We keep the
-- source ref's image_path/width/height so the grid can still be previewed
-- against the original reference even after the project evolves.
create table if not exists project_grids (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references projects(id) on delete cascade,
  source_ref_id     uuid references refs(id) on delete set null,
  source_image_path text,
  source_width      int,
  source_height     int,
  grid_type         text not null default 'columnar'
    check (grid_type in ('columnar','modular','manuscript','custom')),
  cols              int  not null default 6  check (cols  between 1 and 32),
  rowscount         int  not null default 1  check (rowscount between 1 and 32),
  margin_top        numeric not null default 0.05,
  margin_right      numeric not null default 0.05,
  margin_bottom     numeric not null default 0.05,
  margin_left       numeric not null default 0.05,
  gutter_x          numeric not null default 0.02,
  gutter_y          numeric not null default 0.02,
  baseline          numeric,
  custom_v          numeric[] not null default '{}',
  custom_h          numeric[] not null default '{}',
  label             text,
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        text
);
create index if not exists project_grids_project_idx on project_grids (project_id, created_at);

alter table project_grids add column if not exists color text not null
  default 'dark' check (color in ('dark','light'));
alter table project_grids add column if not exists source_grid_id uuid
  references ref_grids(id) on delete set null;
create index if not exists project_grids_source_idx on project_grids (source_grid_id);

alter table project_grids enable row level security;
drop policy if exists "anon all" on project_grids;
create policy "anon all" on project_grids
  for all to anon, authenticated using (true) with check (true);

-- STORAGE BUCKET ------------------------------------------------------------
-- Create the bucket via Supabase dashboard or:
--   insert into storage.buckets (id, name, public) values ('refs', 'refs', true)
--   on conflict (id) do nothing;
