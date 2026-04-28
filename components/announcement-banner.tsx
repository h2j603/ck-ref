"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

import { findProfile, type Profile } from "@/lib/profiles";
import { useNickname } from "@/lib/nickname";
import { projectColor, projectColorSoft } from "@/lib/projectColor";
import type { Announcement, CalendarEvent } from "@/lib/types";

type ProjectLite = { id: string; title: string };

const DISMISSED_ANN_KEY = "ck-ref:dismissed-announcements";
const DISMISSED_ANN_EVENT = "ck-ref:dismissed-announcements-change";
const DISMISSED_EV_KEY = "ck-ref:dismissed-event-reminders";
const DISMISSED_EV_EVENT = "ck-ref:dismissed-event-reminders-change";

// Index banner. Stacks active announcements + today's calendar events
// directly above the WeeklyNudge / filter bar so they're impossible to
// miss when first landing on /. Everyone (including the author) sees
// every active announcement; the X button means "delete for everyone"
// when you authored it, and "hide locally" when someone else did. The
// today's-events section is the same shape — each event has its own
// row + X for per-device dismissal.
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
  const dismissedAnnRaw = useSyncExternalStore(
    makeSubscribe(DISMISSED_ANN_EVENT),
    () => getRawSnapshot(DISMISSED_ANN_KEY),
    getServerSnapshot,
  );
  const dismissedEvRaw = useSyncExternalStore(
    makeSubscribe(DISMISSED_EV_EVENT),
    () => getRawSnapshot(DISMISSED_EV_KEY),
    getServerSnapshot,
  );
  const dismissedAnn = parseSet(dismissedAnnRaw);
  const dismissedEv = parseSet(dismissedEvRaw);

  // Drop dismissed ids that are no longer in the current active set so
  // localStorage doesn't grow forever.
  useEffect(() => {
    pruneDismissed(
      dismissedAnn,
      new Set(items.map((a) => a.id)),
      DISMISSED_ANN_KEY,
      DISMISSED_ANN_EVENT,
    );
  }, [items, dismissedAnn]);

  useEffect(() => {
    pruneDismissed(
      dismissedEv,
      new Set(todayEvents.map((e) => e.id)),
      DISMISSED_EV_KEY,
      DISMISSED_EV_EVENT,
    );
  }, [todayEvents, dismissedEv]);

  function dismissAnn(id: string) {
    addToSet(dismissedAnn, id, DISMISSED_ANN_KEY, DISMISSED_ANN_EVENT);
  }

  function dismissEv(id: string) {
    addToSet(dismissedEv, id, DISMISSED_EV_KEY, DISMISSED_EV_EVENT);
  }

  async function deleteAnnouncement(id: string) {
    if (!nickname) return;
    if (!window.confirm("이 공지를 모두에게서 내릴까요?")) return;
    const res = await fetch(
      `/api/announcements?id=${encodeURIComponent(id)}&author=${encodeURIComponent(nickname)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      // Tell other surfaces (composer dropdown) that the list changed.
      window.dispatchEvent(new CustomEvent("ck-ref:announcements-changed"));
      // Local-dismiss too so the banner updates immediately without a
      // server roundtrip; the next /api/announcements GET will confirm
      // it's gone.
      dismissAnn(id);
    }
  }

  const visibleAnns = items.filter((a) => !dismissedAnn.has(a.id));
  const visibleEvs = todayEvents.filter((e) => !dismissedEv.has(e.id));

  if (visibleAnns.length === 0 && visibleEvs.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {visibleAnns.map((a) => {
        const author = findProfile(profiles, a.created_by);
        const authorName = author?.display_name ?? a.created_by;
        const isAuthor = a.created_by === nickname;
        return (
          <div
            key={a.id}
            className="flex items-start gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="font-mono text-[11px] uppercase tracking-wider">
                공지 · @{authorName}
                {isAuthor ? " · 내 공지" : ""}
              </p>
              <p className="whitespace-pre-wrap break-words">{a.body}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider opacity-70">
                ~ {formatStamp(a.expires_at)}
              </p>
              <button
                type="button"
                onClick={() =>
                  isAuthor ? void deleteAnnouncement(a.id) : dismissAnn(a.id)
                }
                aria-label={isAuthor ? "공지 내리기" : "공지 닫기"}
                title={isAuthor ? "모두에게서 내리기" : "내 화면에서 닫기"}
                className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        );
      })}
      {visibleEvs.length > 0 ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-sky-300/60 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100">
          <p className="font-mono text-[11px] uppercase tracking-wider">
            오늘 일정 · {visibleEvs.length}건
          </p>
          <ul className="flex flex-col gap-1">
            {visibleEvs.map((ev) => {
              const proj = projects.find((p) => p.id === ev.project_id);
              return (
                <li key={ev.id} className="flex items-center gap-2">
                  <Link
                    href="/calendar"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded transition-colors hover:bg-sky-100 dark:hover:bg-sky-500/15"
                  >
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
                        <span className="ml-1.5 text-xs opacity-70">
                          · {proj.title}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismissEv(ev.id)}
                    aria-label="일정 알림 닫기"
                    title="내 화면에서 닫기"
                    className="shrink-0 rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function getRawSnapshot(key: string): string {
  if (typeof window === "undefined") return "[]";
  try {
    return window.localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]";
  }
}

function getServerSnapshot(): string {
  return "[]";
}

function makeSubscribe(eventName: string) {
  return (notify: () => void) => {
    window.addEventListener(eventName, notify);
    window.addEventListener("storage", notify);
    return () => {
      window.removeEventListener(eventName, notify);
      window.removeEventListener("storage", notify);
    };
  };
}

function parseSet(raw: string): Set<string> {
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>, key: string, eventName: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
    window.dispatchEvent(new Event(eventName));
  } catch {
    /* noop */
  }
}

function addToSet(
  current: Set<string>,
  id: string,
  key: string,
  eventName: string,
): void {
  const next = new Set(current);
  next.add(id);
  writeSet(next, key, eventName);
}

function pruneDismissed(
  current: Set<string>,
  liveIds: Set<string>,
  key: string,
  eventName: string,
): void {
  if (current.size === 0) return;
  const next = new Set([...current].filter((id) => liveIds.has(id)));
  if (next.size === current.size) return;
  writeSet(next, key, eventName);
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
