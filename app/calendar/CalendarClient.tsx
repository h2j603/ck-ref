"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { EventDialog } from "./EventDialog";
import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { projectColor, projectColorSoft } from "@/lib/projectColor";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/lib/types";

import type { EventClickArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";

// FullCalendar core + plugins is ~250 KB gzipped. Defer it until the
// /calendar route mounts in the browser; the surrounding header/buttons
// render with no JS-heavy dependency, and the placeholder reserves the
// month grid's height to avoid layout shift.
const FullCalendarMonthGrid = dynamic(
  () => import("./FullCalendarMonthGrid"),
  {
    ssr: false,
    loading: () => <div className="min-h-[640px]" aria-hidden />,
  },
);

type ProjectLite = { id: string; title: string; status: string };

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function eventOnDay(ev: CalendarEvent, day: Date): boolean {
  const dayStart = startOfDay(day);
  const startDay = startOfDay(new Date(ev.starts_at));
  if (!ev.ends_at) return startDay.getTime() === dayStart.getTime();
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

// FullCalendar's `end` is exclusive on its day axis: a multi-day event
// ending on Apr 29 (visually) needs end = Apr 30 00:00. For non-all-day
// events the actual timestamp works as-is. For all-day, we add a day.
function toFullCalendarEvent(ev: CalendarEvent) {
  const color = projectColorSoft(ev.project_id);
  const text = projectColor(ev.project_id);
  return {
    id: ev.id,
    title: ev.title,
    start: ev.starts_at,
    end: computeEnd(ev),
    allDay: ev.all_day,
    backgroundColor: color,
    borderColor: color,
    textColor: text,
    extendedProps: {
      projectId: ev.project_id,
      raw: ev,
    },
  };
}

function computeEnd(ev: CalendarEvent): string | undefined {
  if (!ev.ends_at) return undefined;
  if (!ev.all_day) return ev.ends_at;
  // All-day with ends_at — bump by one day so FullCalendar renders the
  // last day inclusively.
  const d = new Date(ev.ends_at);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
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

  // Refetch when the user pages outside the prefetched buffer. Includes
  // events whose ends_at is inside the window even if starts_at is before.
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

  function handleDateClick(arg: DateClickArg) {
    setSelectedDay(arg.date);
    setComposing(false);
    setEditing(null);
  }

  function handleEventClick(arg: EventClickArg) {
    const id = arg.event.id;
    const raw = events.find((e) => e.id === id);
    if (!raw) return;
    setSelectedDay(new Date(raw.starts_at));
    setEditing(null);
    setComposing(false);
    // Open the day panel so the user can pick edit / delete from there.
    setSelectedDay(new Date(raw.starts_at));
  }

  const fcEvents = useMemo(() => events.map(toFullCalendarEvent), [events]);

  const dayPanelEvents = selectedDay
    ? events.filter((ev) => eventOnDay(ev, selectedDay))
    : [];

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

      {/*
        FullCalendar handles multi-day event rendering as continuous bars
        natively — the custom-grid bridging headache goes away.
        Tailwind v4 styles target FC's class names directly to match the
        rest of the app's typography / borders.
      */}
      <div className="ck-calendar text-xs">
        <FullCalendarMonthGrid
          initialDate={new Date(initialYear, initialMonth, 1)}
          visibleDate={new Date(year, month, 1)}
          events={fcEvents}
          onDateClick={handleDateClick}
          onEventClick={handleEventClick}
        />
      </div>

      {selectedDay ? (
        <DayPanel
          day={selectedDay}
          events={dayPanelEvents}
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

