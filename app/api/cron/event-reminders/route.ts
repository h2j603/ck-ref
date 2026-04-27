import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/lib/types";

// Vercel Cron pings this every 5 minutes (see vercel.json). Two reminder
// kinds, both posted directly to DISCORD_WEBHOOK_URL:
//
//   1. 🌅 Morning — fires after Asia/Seoul midnight on the event's day.
//   2. ⏰ One hour before — fires when starts_at is within the next hour.
//
// Each event has notified_morning / notified_hour flags so we don't send
// the same reminder twice. Marking is eager (right before the Discord
// POST): a Discord outage will silently drop a reminder rather than
// double-send it later.
//
// Auth: Vercel auto-attaches `Authorization: Bearer ${CRON_SECRET}` to
// scheduled invocations when CRON_SECRET is set. We accept either that or
// the existing SUPABASE_WEBHOOK_SECRET so curl-test calls work too.

export const dynamic = "force-dynamic";

const KST_OFFSET = "+09:00";
const SEOUL_TZ = "Asia/Seoul";

function authorize(request: Request): boolean {
  const provided = (request.headers.get("authorization") ?? "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const candidates = [process.env.CRON_SECRET, process.env.SUPABASE_WEBHOOK_SECRET]
    .map((s) => s?.trim().replace(/^Bearer\s+/i, ""))
    .filter((s): s is string => !!s);
  return candidates.some((c) => c === provided);
}

function startOfDayInSeoul(iso: string): Date {
  // Asia/Seoul has no DST, so a fixed +09:00 is sufficient and avoids a
  // dependency on the (small) Intl tz database differences across runtimes.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = fmt.format(new Date(iso));
  return new Date(`${ymd}T00:00:00${KST_OFFSET}`);
}

function formatHHmmKst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

type EventWithProject = CalendarEvent & {
  projects: { title: string; id: string } | { title: string; id: string }[] | null;
};

function projectTitle(ev: EventWithProject): string | null {
  const p = Array.isArray(ev.projects) ? ev.projects[0] : ev.projects;
  return p?.title ?? null;
}

async function sendDiscord(
  webhookUrl: string,
  description: string,
  ping: boolean,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "CK Ref. — 캘린더",
        ...(ping ? { content: "@everyone" } : {}),
        embeds: [{ description }],
        allowed_mentions: ping ? { parse: ["everyone"] } : { parse: [] },
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("event reminder discord post failed", err);
    return false;
  }
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!discordUrl) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_discord_url" });
  }

  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  // Clamp the morning lookback so we don't suddenly notify about an event
  // from last week the first time the cron is enabled.
  const morningSince = new Date(
    now.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();

  const select = "*, projects(id, title)";

  const [hourRes, morningRes] = await Promise.all([
    supabase
      .from("events")
      .select(select)
      .eq("notified_hour", false)
      .gte("starts_at", nowIso)
      .lte("starts_at", inOneHour),
    supabase
      .from("events")
      .select(select)
      .eq("notified_morning", false)
      .gte("starts_at", morningSince),
  ]);

  let sentHour = 0;
  let sentMorning = 0;

  for (const row of (hourRes.data ?? []) as EventWithProject[]) {
    // All-day events shouldn't trip the "1시간 전" path — their starts_at
    // is local midnight, which would fire late the previous evening.
    if (row.all_day) continue;
    const proj = projectTitle(row);
    const time = formatHHmmKst(row.starts_at);
    const desc =
      `⏰ **1시간 후** — **${row.title}** · ${time}` +
      (proj ? ` · ${proj}` : "");
    // Mark first to dodge double-send on overlapping cron runs.
    const { error: updErr } = await supabase
      .from("events")
      .update({ notified_hour: true })
      .eq("id", row.id)
      .eq("notified_hour", false);
    if (updErr) continue;
    if (await sendDiscord(discordUrl, desc, true)) sentHour += 1;
  }

  for (const row of (morningRes.data ?? []) as EventWithProject[]) {
    const dayStart = startOfDayInSeoul(row.starts_at);
    if (dayStart.getTime() > now.getTime()) continue; // not yet that day in KST
    if (new Date(row.starts_at).getTime() < now.getTime()) {
      // Event already started — skip the morning ping (the hour-before
      // path would have caught it if appropriate).
      const { error } = await supabase
        .from("events")
        .update({ notified_morning: true })
        .eq("id", row.id);
      if (error) continue;
      continue;
    }
    const proj = projectTitle(row);
    const time = row.all_day ? "종일" : formatHHmmKst(row.starts_at);
    const desc =
      `🌅 **오늘 일정** — **${row.title}** · ${time}` +
      (proj ? ` · ${proj}` : "");
    const { error: updErr } = await supabase
      .from("events")
      .update({ notified_morning: true })
      .eq("id", row.id)
      .eq("notified_morning", false);
    if (updErr) continue;
    if (await sendDiscord(discordUrl, desc, true)) sentMorning += 1;
  }

  return NextResponse.json({
    ok: true,
    sentMorning,
    sentHour,
    nowIso,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
