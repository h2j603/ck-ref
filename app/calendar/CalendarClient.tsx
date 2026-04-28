"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EventDialog } from "./EventDialog";
import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { projectColor, projectColorSoft } from "@/lib/projectColor";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";

type ProjectLite = { id: string; title: string; status: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - out.getDay());
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function eventOnDay(ev: CalendarEvent, day: Date): boolean {
  const dayStart = startOfDay(day);
  const startDay = startOfDay(new Date(ev.starts_at));
  if (!ev.ends_at) return startDay.getTime() === dayStart.getTime();
  // ends_at is inclusive at the day level: an event ending at "2026-04-29
  // 16:00" still belongs on Apr 29. An ends_at exactly at midnight is
  // treated as the end of the previous day so a one-night event doesn't
  // bleed into the next morning's cell.
  const endRaw = new Date(ev.ends_at);
  const endDay =
    endRaw.getHours() === 0 &&
    endRaw.getMinutes() === 0 &&
    endRaw.getSeconds() === 0 &&
    endRaw.getTime() > startDay.getTime()
      ? startOfDay(new Date(endRaw.getTime() - 1))
      : startOfDay(endRaw);
  return (
    dayStart.getTime() >= startDay.getTime() &&
    dayStart.getTime() <= endDay.getTime()
  );
}

function eventSpan(ev: CalendarEvent, day: Date): "single" | "start" | "mid" | "end" {
  if (!ev.ends_at) return "single";
  const dayStart = startOfDay(day);
  const startDay = startOfDay(new Date(ev.starts_at));
  const endRaw = new Date(ev.ends_at);
  const endDay =
    endRaw.getHours() === 0 &&
    endRaw.getMinutes() === 0 &&
    endRaw.getSeconds() === 0 &&
    endRaw.getTime() > startDay.getTime()
      ? startOfDay(new Date(endRaw.getTime() - 1))
      : startOfDay(endRaw);
  if (startDay.getTime() === endDay.getTime()) return "single";
  if (dayStart.getTime() === startDay.getTime()) return "start";
  if (dayStart.getTime() === endDay.getTime()) return "end";
  return "mid";
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function CalendarClient({
  initialYear,
  initialMonth,
  initialEvents,
  projects,
}: {
  initialYear: number;
  initialMonth: number;
  initialEvents: CalendarEvent[];
  projects: ProjectLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [composing, setComposing] = useState(false);

  // Refetch when the user pages outside the initial 3-month buffer the
  // server prefetched. Keeps everything in-memory once we've fetched.
  // Multi-day events: include rows whose ends_at is in the window even if
  // starts_at is before it, so a project that began last month still shows
  // on every visible day this month.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const from = new Date(year, month - 1, 1).toISOString();
      const to = new Date(year, month + 2, 1).toISOString();
      const { data } = await supabase
        .from("events")
        .select("*")
        .lt("starts_at", to)
        .or(`ends_at.gte.${from},and(ends_at.is.null,starts_at.gte.${from})`)
        .order("starts_at", { ascending: true });
      if (cancelled) return;
      setEvents((data ?? []) as CalendarEvent[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, year, month]);

  // 6 rows × 7 cols grid for any given month, so the layout doesn't
  // shift between months that have 4 vs 6 visual weeks.
  const grid = useMemo(() => {
    const first = startOfMonth(year, month);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [year, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of grid) {
      const list = events.filter((ev) => eventOnDay(ev, day));
      if (list.length > 0) map.set(dayKey(day), list);
    }
    return map;
  }, [events, grid]);

  const today = new Date();
  const monthLabel = `${year}.${String(month + 1).padStart(2, "0")}`;

  function shift(by: number) {
    let nm = month + by;
    let ny = year;
    while (nm < 0) {
      nm += 12;
      ny -= 1;
    }
    while (nm > 11) {
      nm -= 12;
      ny += 1;
    }
    setYear(ny);
    setMonth(nm);
  }

  function gotoToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  function handleSaved(ev: CalendarEvent) {
    setEvents((prev) => {
      const without = prev.filter((e) => e.id !== ev.id);
      return [...without, ev].sort((a, b) =>
        a.starts_at.localeCompare(b.starts_at),
      );
    });
  }

  function handleDeleted(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="prev"
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <h2 className="font-mono text-sm tabular-nums">{monthLabel}</h2>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="next"
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={gotoToday}
            className="ml-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            오늘
          </button>
        </div>
        {hydrated && nickname ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditing(null);
              setSelectedDay(today);
              setComposing(true);
            }}
          >
            <Plus className="size-3" /> 일정 추가
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-7 border-l border-t border-border/60 text-xs">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={cn(
              "border-b border-r border-border/60 px-1.5 py-1.5 font-mono text-[10px] uppercase tracking-wider",
              i === 0 && "text-rose-600",
              i === 6 && "text-sky-600",
              i !== 0 && i !== 6 && "text-muted-foreground",
            )}
          >
            {w}
          </div>
        ))}
        {grid.map((day, i) => {
          const inMonth = day.getMonth() === month;
          const isToday = sameDay(day, today);
          const list = eventsByDay.get(dayKey(day)) ?? [];
          return (
            <button
              type="button"
              key={i}
              onClick={() => {
                setSelectedDay(day);
                setComposing(false);
                setEditing(null);
              }}
              className={cn(
                // overflow-visible matters: <button> defaults to
                // overflow:hidden on Safari/iOS, which would clip
                // multi-day chips that bleed into adjacent cells via
                // negative margin.
                "flex min-h-[80px] flex-col items-stretch gap-0.5 overflow-visible border-b border-r border-border/60 p-1 text-left transition-colors",
                inMonth ? "bg-background" : "bg-muted/40 text-muted-foreground",
                "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "self-end font-mono text-[11px] tabular-nums leading-none",
                  isToday &&
                    "rounded-full bg-foreground px-1.5 py-0.5 text-background",
                )}
              >
                {day.getDate()}
              </span>
              <ul className="flex flex-col gap-0.5">
                {list.slice(0, 3).map((ev) => {
                  const span = eventSpan(ev, day);
                  // Multi-day chips bridge the cell's 4px padding + 1px
                  // right border + 4px next-cell padding via inline
                  // negative margins. Tailwind arbitrary values
                  // (-mr-[5px]) weren't being applied in production —
                  // likely a JIT edge case — so we sidestep with style.
                  // 5px past each joining edge gives a 1px overlap
                  // inside the cell border, making the bar read as one
                  // continuous run. Title only on the first day.
                  // position:relative + z-index lifts the chip above the
                  // cell's border-r so the bg color visibly bridges
                  // adjacent cells. Without this the cell border paints
                  // on top and breaks the bar visually.
                  const chipStyle: React.CSSProperties = {
                    backgroundColor: projectColorSoft(ev.project_id),
                    color: projectColor(ev.project_id),
                    position: "relative",
                    zIndex: 1,
                  };
                  if (span === "start" || span === "mid") {
                    chipStyle.marginRight = "-5px";
                  }
                  if (span === "end" || span === "mid") {
                    chipStyle.marginLeft = "-5px";
                  }
                  return (
                    <li
                      key={ev.id}
                      className={cn(
                        "truncate px-1.5 py-0.5 text-[10px]",
                        span === "single" && "rounded-sm",
                        span === "start" && "rounded-l-sm",
                        span === "end" && "rounded-r-sm",
                      )}
                      style={chipStyle}
                    >
                      {span === "mid" || span === "end" ? " " : ev.title}
                    </li>
                  );
                })}
                {list.length > 3 ? (
                  <li className="px-1 font-mono text-[9px] text-muted-foreground">
                    +{list.length - 3}
                  </li>
                ) : null}
              </ul>
            </button>
          );
        })}
      </div>

      {selectedDay ? (
        <DayPanel
          day={selectedDay}
          events={(eventsByDay.get(dayKey(selectedDay)) ?? []).slice()}
          projects={projects}
          onClose={() => {
            setSelectedDay(null);
            setComposing(false);
            setEditing(null);
          }}
          onAdd={() => setComposing(true)}
          onEdit={(ev) => {
            setEditing(ev);
            setComposing(true);
          }}
          onDelete={async (ev) => {
            if (!window.confirm("이 일정을 삭제할까요?")) return;
            await supabase.from("events").delete().eq("id", ev.id);
            handleDeleted(ev.id);
          }}
          canEdit={hydrated && !!nickname}
        />
      ) : null}

      {composing && selectedDay ? (
        <EventDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setComposing(false);
              setEditing(null);
            }
          }}
          day={selectedDay}
          projects={projects}
          existing={editing}
          onSaved={(ev) => {
            handleSaved(ev);
            setComposing(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function DayPanel({
  day,
  events,
  projects,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  canEdit,
}: {
  day: Date;
  events: CalendarEvent[];
  projects: ProjectLite[];
  onClose: () => void;
  onAdd: () => void;
  onEdit: (ev: CalendarEvent) => void;
  onDelete: (ev: CalendarEvent) => void;
  canEdit: boolean;
}) {
  const label = `${day.getFullYear()}.${String(day.getMonth() + 1).padStart(2, "0")}.${String(day.getDate()).padStart(2, "0")}`;
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/30 p-4">
      <header className="flex items-center justify-between">
        <h3 className="font-mono text-sm tabular-nums">{label}</h3>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAdd}
              className="h-7 px-2 text-[11px]"
            >
              <Plus className="size-3" /> 일정
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            닫기
          </button>
        </div>
      </header>
      {events.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          이날 일정이 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((ev) => {
            const proj = projects.find((p) => p.id === ev.project_id);
            return (
              <li
                key={ev.id}
                className="flex items-start gap-3 rounded-md bg-background p-3"
              >
                <span
                  aria-hidden
                  className="mt-1 inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: projectColor(ev.project_id) }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm font-medium">{ev.title}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {ev.all_day
                      ? "종일"
                      : new Date(ev.starts_at).toLocaleTimeString("ko-KR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                    {proj ? ` · ${proj.title}` : ""}
                  </p>
                  {ev.body ? (
                    <p className="whitespace-pre-wrap text-xs text-foreground/80">
                      {ev.body}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(ev)}
                      className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(ev)}
                      className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-destructive"
                    >
                      삭제
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
