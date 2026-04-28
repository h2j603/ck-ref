"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { findProfile, type Profile } from "@/lib/profiles";
import { useNickname } from "@/lib/nickname";
import { projectColor, projectColorSoft } from "@/lib/projectColor";
import type { Announcement, CalendarEvent } from "@/lib/types";

type ProjectLite = { id: string; title: string };

const DISMISSED_KEY = "ck-ref:dismissed-announcements";
const DISMISSED_EVENT = "ck-ref:dismissed-announcements-change";

// Index banner. Stacks active announcements + today's calendar events
// directly above the WeeklyNudge / filter bar so they're impossible to
// miss when first landing on /. Author's own announcements are hidden
// from their banner (they already see them in the composer dropdown);
// everyone else can locally dismiss a card with the X button — the
// dismissal is per-device, persisted in localStorage, and re-appears
// when a new announcement with the same id is somehow re-published.
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
  const { nickname } = useNickname();
  const dismissedKey = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
    getDismissedServerSnapshot,
  );
  const dismissed = parseDismissed(dismissedKey);

  // Drop any persisted ids that are no longer in the active set so the
  // localStorage list doesn't grow forever.
  useEffect(() => {
    if (dismissed.size === 0) return;
    const liveIds = new Set(items.map((a) => a.id));
    const next = new Set([...dismissed].filter((id) => liveIds.has(id)));
    if (next.size === dismissed.size) return;
    writeDismissed(next);
  }, [items, dismissed]);

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    writeDismissed(next);
  }

  const visible = items.filter(
    (a) => a.created_by !== nickname && !dismissed.has(a.id),
  );

  if (visible.length === 0 && todayEvents.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {visible.map((a) => {
        const author = findProfile(profiles, a.created_by);
        const authorName = author?.display_name ?? a.created_by;
        return (
          <div
            key={a.id}
            className="flex items-start gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="font-mono text-[11px] uppercase tracking-wider">
                공지 · @{authorName}
              </p>
              <p className="whitespace-pre-wrap break-words">{a.body}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider opacity-70">
                ~ {formatStamp(a.expires_at)}
              </p>
              <button
                type="button"
                onClick={() => dismiss(a.id)}
                aria-label="공지 닫기"
                className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
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

// useSyncExternalStore needs a stable snapshot string. We store the raw
// JSON and parse on read; this keeps the snapshot referentially equal
// across renders unless localStorage actually changed.
function getDismissedSnapshot(): string {
  if (typeof window === "undefined") return "[]";
  try {
    return window.localStorage.getItem(DISMISSED_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function getDismissedServerSnapshot(): string {
  return "[]";
}

function subscribeDismissed(notify: () => void): () => void {
  window.addEventListener(DISMISSED_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(DISMISSED_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

function parseDismissed(raw: string): Set<string> {
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
    window.dispatchEvent(new Event(DISMISSED_EVENT));
  } catch {
    /* noop */
  }
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
