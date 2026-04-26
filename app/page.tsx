import { cookies } from "next/headers";
import { Suspense } from "react";

import { ColumnSelector } from "@/components/gallery/ColumnSelector";
import { FilterBar } from "@/components/gallery/FilterBar";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { WeeklyNudge } from "@/components/weekly-nudge";
import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import { HUE_BUCKETS, type HueBucket } from "@/lib/color";
import { findProfile, isProfileKey } from "@/lib/profiles";
import {
  countRefsByUserSince,
  fetchAllTags,
  fetchProfiles,
  fetchRefs,
  type RefFilter,
} from "@/lib/queries";
import { startOfThisWeekUtcIso } from "@/lib/week";

type SearchParams = Promise<{
  genre?: string;
  medium?: string;
  language?: string;
  hue?: string;
  tag?: string | string[];
}>;

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const hue = HUE_BUCKETS.includes(sp.hue as HueBucket)
    ? (sp.hue as HueBucket)
    : undefined;
  const filter: RefFilter = {
    genre: sp.genre,
    medium: sp.medium,
    language: sp.language,
    hue,
    tags: sp.tag ? (Array.isArray(sp.tag) ? sp.tag : [sp.tag]) : undefined,
  };

  const store = await cookies();
  const me = store.get(ARCHIVE_AUTH_COOKIE)?.value ?? null;

  const [refs, tags, weeklyCount, profiles] = await Promise.all([
    fetchRefs(filter).catch(() => []),
    fetchAllTags().catch(() => []),
    me && isProfileKey(me)
      ? countRefsByUserSince(me, startOfThisWeekUtcIso()).catch(() => 1)
      : Promise.resolve(1),
    me && isProfileKey(me) ? fetchProfiles().catch(() => []) : Promise.resolve([]),
  ]);

  const myProfile = me && isProfileKey(me) ? findProfile(profiles, me) : null;
  const showNudge = myProfile && weeklyCount === 0;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      {showNudge ? <WeeklyNudge displayName={myProfile.display_name} /> : null}
      <header className="flex items-center justify-between gap-4 pt-2">
        <h1 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Index — {refs.length} item{refs.length === 1 ? "" : "s"}
        </h1>
        <ColumnSelector />
      </header>
      <Suspense fallback={null}>
        <FilterBar allTags={tags} />
      </Suspense>
      <MasonryGrid refs={refs} />
    </div>
  );
}
