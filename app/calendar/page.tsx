import { CalendarClient } from "./CalendarClient";
import { fetchEventsBetween, fetchProjects } from "@/lib/queries";

export const metadata = {
  title: "Calendar — KIWI Juice",
};

// Width of the date window we hand to the client: previous + current +
// next month. The client lets the user page months without a server
// round-trip until the buffer runs out.
const MONTHS_BEFORE = 1;
const MONTHS_AFTER = 1;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const { y, m } = await searchParams;
  const today = new Date();
  const year = y && /^\d{4}$/.test(y) ? Number(y) : today.getFullYear();
  const month =
    m && /^\d{1,2}$/.test(m) && Number(m) >= 1 && Number(m) <= 12
      ? Number(m) - 1
      : today.getMonth();

  const from = new Date(year, month - MONTHS_BEFORE, 1).toISOString();
  const to = new Date(year, month + MONTHS_AFTER + 1, 1).toISOString();

  const [events, projects] = await Promise.all([
    fetchEventsBetween(from, to).catch(() => []),
    fetchProjects().catch(() => []),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 pt-2">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / Calendar
        </p>
      </header>
      <CalendarClient
        initialYear={year}
        initialMonth={month}
        initialEvents={events}
        projects={projects.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
        }))}
      />
    </div>
  );
}
