-- CK Ref. — Supabase schema
-- Run this in the Supabase SQL editor.
-- This is a v1 schema. RLS is left permissive because the app gates access
-- via a single shared password at the proxy layer.

create extension if not exists "pgcrypto";

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

-- REF <-> DESIGNER ----------------------------------------------------------

create table if not exists ref_designers (
  ref_id      uuid not null references refs(id) on delete cascade,
  designer_id uuid not null references designers(id) on delete cascade,
  primary key (ref_id, designer_id)
);

create index if not exists ref_designers_designer_idx on ref_designers (designer_id);

-- NOTES ---------------------------------------------------------------------

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  ref_id      uuid not null references refs(id) on delete cascade,
  body        text not null,
  author      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists notes_ref_idx on notes (ref_id, created_at desc);

-- Maintain refs.notes_count -------------------------------------------------

create or replace function bump_notes_count() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update refs set notes_count = notes_count + 1 where id = new.ref_id;
  elsif (tg_op = 'DELETE') then
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

-- STORAGE BUCKET ------------------------------------------------------------
-- Create the bucket via Supabase dashboard or:
--   insert into storage.buckets (id, name, public) values ('refs', 'refs', true)
--   on conflict (id) do nothing;
