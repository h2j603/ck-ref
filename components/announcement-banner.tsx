import Link from "next/link";

import { findProfile, type Profile } from "@/lib/profiles";
import { projectColor, projectColorSoft } from "@/lib/projectColor";
import type { Announcement, CalendarEvent } from "@/lib/types";

type ProjectLite = { id: string; title: string };

// Index banner. Stacks active announcements + today's calendar events
// directly above the WeeklyNudge / filter bar so they're impossible to
// miss when first landing on /. Server-rendered: the icon-composer in the
// header is the thing that mutates announcement state; events come from
// the calendar.
export function AnnouncementBanner({
  items,
  todayEvents,
  projects,
  profiles,
}: {
  items: Announcement[];
  todayEvents: CalendarEvent[];
  projects: ProjectLite[];
  profiles: Profile[];
}) {
  if (items.length === 0 && todayEvents.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {items.map((a) => {
        const author = findProfile(profiles, a.created_by);
        const authorName = author?.display_name ?? a.created_by;
        return (
          <div
            key={a.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-mono text-[11px] uppercase tracking-wider">
                공지 · @{authorName}
              </p>
              <p className="whitespace-pre-wrap break-words">{a.body}</p>
            </div>
            <p className="shrink-0 font-mono text-[10px] uppercase tracking-wider opacity-70">
              ~ {formatStamp(a.expires_at)}
            </p>
          </div>
        );
      })}
      {todayEvents.length > 0 ? (
        <Link
          href="/calendar"
          className="flex flex-col gap-1.5 rounded-md border border-sky-300/60 bg-sky-50 px-4 py-3 text-sm text-sky-900 transition-colors hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100 dark:hover:bg-sky-500/15"
        >
          <p className="font-mono text-[11px] uppercase tracking-wider">
            오늘 일정 · {todayEvents.length}건
          </p>
          <ul className="flex flex-col gap-1">
            {todayEvents.map((ev) => {
              const proj = projects.find((p) => p.id === ev.project_id);
              return (
                <li key={ev.id} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                    style={{
                      backgroundColor: projectColorSoft(ev.project_id),
                      color: projectColor(ev.project_id),
                    }}
                  >
                    {eventStamp(ev)}
                  </span>
                  <span className="truncate">
                    {ev.title}
                    {proj ? (
                      <span className="ml-1.5 text-xs opacity-70">· {proj.title}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Link>
      ) : null}
    </div>
  );
}

function formatStamp(iso: string): string {
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date(iso));
}

function timeOnly(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// "종일", "10:00", or "~17:00" depending on whether the event has a time
// today (could be ongoing from a previous day).
function eventStamp(ev: CalendarEvent): string {
  if (ev.all_day) return "종일";
  const startsToday = isTodayInSeoul(ev.starts_at);
  if (!startsToday && ev.ends_at) {
    return `~${timeOnly(ev.ends_at)}`;
  }
  return timeOnly(ev.starts_at);
}

function isTodayInSeoul(iso: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(iso)) === fmt.format(new Date());
}
