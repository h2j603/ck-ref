"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import { useEffect, useRef } from "react";

import type { EventClickArg, EventInput } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";

export type FullCalendarMonthGridProps = {
  initialDate: Date;
  // The visible month is driven by parent state (year/month). We push it
  // into FullCalendar's API via gotoDate when it changes, instead of
  // exposing the FC ref through next/dynamic.
  visibleDate: Date;
  events: EventInput[];
  onDateClick: (arg: DateClickArg) => void;
  onEventClick: (arg: EventClickArg) => void;
};

export default function FullCalendarMonthGrid({
  initialDate,
  visibleDate,
  events,
  onDateClick,
  onEventClick,
}: FullCalendarMonthGridProps) {
  const ref = useRef<FullCalendar | null>(null);
  const visibleTime = visibleDate.getTime();

  useEffect(() => {
    const api = ref.current?.getApi?.();
    if (!api) return;
    api.gotoDate(visibleDate);
    // Track time, not Date identity, to avoid re-running on parent rerenders
    // that pass a fresh Date with the same instant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTime]);

  return (
    <FullCalendar
      ref={ref}
      plugins={[dayGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      initialDate={initialDate}
      locale="ko"
      firstDay={0}
      headerToolbar={false}
      height="auto"
      fixedWeekCount
      dayMaxEvents={3}
      moreLinkText={(n) => `+${n}`}
      dayHeaderFormat={{ weekday: "narrow" }}
      dayHeaderClassNames="ck-cal-dayhead"
      dayCellClassNames="ck-cal-daycell"
      eventClassNames="ck-cal-event"
      events={events}
      dateClick={onDateClick}
      eventClick={onEventClick}
    />
  );
}
