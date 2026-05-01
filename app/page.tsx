import { cookies } from "next/headers";
import { Suspense } from "react";

import { AnnouncementBanner } from "@/components/announcement-banner";
import { ColumnSelector } from "@/components/gallery/ColumnSelector";
import { FilterBar } from "@/components/gallery/FilterBar";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { WeeklyNudge } from "@/components/weekly-nudge";
import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import { HUE_BUCKETS, type HueBucket } from "@/lib/color";
import { pickNudge } from "@/lib/nudges";
import { findProfile, isProfileKey } from "@/lib/profiles";
import {
  countRefsByUserSince,
  fetchActiveAnnouncements,
  fetchAllTags,
  fetchEventsBetween,
  fetchProfiles,
  fetchProjects,
  fetchRefs,
  REF_SORTS,
  type RefFilter,
  type RefSort,
} from "@/lib/queries";
import { startOfThisWeekUtcIso } from "@/lib/week";

type SearchParams = Promise<{
  genre?: string;
  medium?: string;
  language?: string;
  hue?: string;
  sort?: string;
  q?: string;
  tag?: string | string[];
  // "1" → 그리드 분석된 ref만 노출. 빈 값/없음이면 전체.
  grid?: string;
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
  const sort = (REF_SORTS as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as RefSort)
    : undefined;
  const filter: RefFilter = {
    genre: sp.genre,
    medium: sp.medium,
    language: sp.language,
    hue,
    sort,
    q: sp.q,
    tags: sp.tag ? (Array.isArray(sp.tag) ? sp.tag : [sp.tag]) : undefined,
    hasGrid: sp.grid === "1",
  };

  const store = await cookies();
  const me = store.get(ARCHIVE_AUTH_COOKIE)?.value ?? null;

  // Today's window in Asia/Seoul. The calendar itself stores ISO with
  // offset, but "today" for the team is unambiguously the KST day.
  const { todayStartIso, tomorrowStartIso } = seoulDayWindow();

  const [
    refs,
    tags,
    weeklyCount,
    profiles,
    announcements,
    todayEvents,
    projects,
  ] = await Promise.all([
    fetchRefs(filter).catch(() => []),
    fetchAllTags().catch(() => []),
    me && isProfileKey(me)
      ? countRefsByUserSince(me, startOfThisWeekUtcIso()).catch(() => 1)
      : Promise.resolve(1),
    me && isProfileKey(me) ? fetchProfiles().catch(() => []) : Promise.resolve([]),
    fetchActiveAnnouncements().catch(() => []),
    fetchEventsBetween(todayStartIso, tomorrowStartIso)
      .then((rows) => rows.filter((ev) => ev.announce))
      .catch(() => []),
    fetchProjects().catch(() => []),
  ]);

  const myProfile = me && isProfileKey(me) ? findProfile(profiles, me) : null;
  const showNudge = myProfile && weeklyCount === 0;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <AnnouncementBanner
        items={announcements}
        todayEvents={todayEvents}
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
        profiles={profiles}
      />
      {showNudge ? (
        <WeeklyNudge
          displayName={myProfile.display_name}
          message={pickNudge()}
        />
      ) : null}
      <header className="flex items-center justify-between gap-4 pt-2">
        <h1 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Index — {refs.length} item{refs.length === 1 ? "" : "s"}
        </h1>
        <ColumnSelector />
      </header>
      <Suspense fallback={null}>
        <FilterBar allTags={tags} />
      </Suspense>
      <MasonryGrid refs={refs} sort={sort ?? "latest"} />
    </div>
  );
}

function seoulDayWindow(): { todayStartIso: string; tomorrowStartIso: string } {
  // Asia/Seoul has no DST so a fixed +09:00 offset is sufficient and
  // sidesteps small Intl tz database differences across runtimes.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = fmt.format(new Date());
  const todayStart = new Date(`${ymd}T00:00:00+09:00`);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  return {
    todayStartIso: todayStart.toISOString(),
    tomorrowStartIso: tomorrowStart.toISOString(),
  };
}
