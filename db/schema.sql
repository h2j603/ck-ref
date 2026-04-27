-- CK Ref. — Supabase schema
-- Run this in the Supabase SQL editor.
-- This is a v1 schema. RLS is left permissive because the app gates access
-- via a single shared password at the proxy layer.

create extension if not exists "pgcrypto";

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
  status      text not null default 'in_progress' check (status in ('in_progress', 'done')),
  created_at  timestamptz not null default now(),
  created_by  text
);

create index if not exists projects_status_idx     on projects (status);
create index if not exists projects_created_at_idx on projects (created_at desc);
create index if not exists projects_created_by_idx on projects (created_by);

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
  added_at   timestamptz not null default now(),
  added_by   text,
  primary key (project_id, ref_id)
);

create index if not exists project_refs_ref_idx on project_refs (ref_id);

-- BOARDS (moodboards) -------------------------------------------------------
-- A board is a curated collection of refs. Anyone with a nickname can add or
-- remove items from any board (3-person trust model); only the creator can
-- edit the board metadata or delete the board itself.

create table if not exists boards (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  created_at  timestamptz not null default now(),
  created_by  text
);

create index if not exists boards_created_at_idx on boards (created_at desc);
create index if not exists boards_created_by_idx on boards (created_by);

create table if not exists board_items (
  board_id  uuid not null references boards(id) on delete cascade,
  ref_id    uuid not null references refs(id) on delete cascade,
  position  int not null default 0,
  added_at  timestamptz not null default now(),
  added_by  text,
  primary key (board_id, ref_id)
);

create index if not exists board_items_board_idx on board_items (board_id, position);
create index if not exists board_items_ref_idx on board_items (ref_id);

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

-- Dominant color extracted client-side at upload. color_hex is for display,
-- color_hue (0-359) for cheap range filters; NULL hue = greyscale/neutral.
alter table refs add column if not exists color_hex text;
alter table refs add column if not exists color_hue smallint;
create index if not exists refs_color_hue_idx on refs (color_hue);

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
alter table notes alter column body drop not null;
alter table notes alter column ref_id drop not null;

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
alter table ref_annotations alter column ref_id drop not null;
alter table ref_annotations drop constraint if exists ref_annotations_target_check;
alter table ref_annotations add constraint ref_annotations_target_check check (
  (ref_id is not null)::int + (project_update_id is not null)::int = 1
);

create index if not exists ref_annotations_ref_idx    on ref_annotations (ref_id, created_at desc);
create index if not exists ref_annotations_update_idx on ref_annotations (project_update_id, created_at desc);

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

-- RLS POLICIES --------------------------------------------------------------
-- Supabase enables RLS by default on tables exposed via PostgREST. Without
-- policies, anon-key inserts are rejected with "new row violates row-level
-- security policy". This app gates access at the proxy layer (single shared
-- password), so we expose permissive policies for anon + authenticated.

alter table profiles        enable row level security;
alter table projects        enable row level security;
alter table project_updates enable row level security;
alter table project_refs    enable row level security;
alter table boards          enable row level security;
alter table board_items     enable row level security;
alter table designers       enable row level security;
alter table refs          enable row level security;
alter table ref_designers   enable row level security;
alter table ref_images      enable row level security;
alter table ref_ratings     enable row level security;
alter table ref_annotations enable row level security;
alter table ref_links       enable row level security;
alter table notes         enable row level security;

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

drop policy if exists "anon all" on ref_annotations;
create policy "anon all" on ref_annotations
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on ref_links;
create policy "anon all" on ref_links
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "anon all" on notes;
create policy "anon all" on notes
  for all to anon, authenticated using (true) with check (true);

-- STORAGE BUCKET ------------------------------------------------------------
-- Create the bucket via Supabase dashboard or:
--   insert into storage.buckets (id, name, public) values ('refs', 'refs', true)
--   on conflict (id) do nothing;
