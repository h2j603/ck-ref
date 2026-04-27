import { NextResponse } from "next/server";

import { findProfile } from "@/lib/profiles";
import { fetchProfiles } from "@/lib/queries";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/profiles";

// Receives Supabase Database Webhook POSTs and forwards a formatted message
// to a Discord channel webhook. Each message is sent under the actor's own
// profile name + avatar (Discord allows per-message username/avatar override
// on webhooks) so the channel reads like a team feed.

type SupabaseHookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

const SNIPPET_LIMIT = 280;

export async function POST(req: Request) {
  const rawSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!rawSecret) {
    return NextResponse.json(
      { error: "SUPABASE_WEBHOOK_SECRET is not configured." },
      { status: 500 },
    );
  }
  // Be tolerant of common configuration mistakes on either side: stray
  // whitespace, accidental "Bearer " prefix on the env var, or a Supabase
  // header that omits the "Bearer " prefix entirely.
  const expected = rawSecret.trim().replace(/^Bearer\s+/i, "");
  const provided = (req.headers.get("authorization") ?? "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  if (!provided || provided !== expected) {
    const diag = {
      hasHeader: req.headers.has("authorization"),
      providedLen: provided.length,
      expectedLen: expected.length,
      sameLen: provided.length === expected.length,
    };
    console.error("discord webhook auth mismatch", JSON.stringify(diag));
    return NextResponse.json(
      { error: "unauthorized", ...diag },
      { status: 401 },
    );
  }
  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!discordUrl) {
    return NextResponse.json({ ok: true, sent: false, reason: "no_discord_url" });
  }

  let payload: SupabaseHookPayload;
  try {
    payload = (await req.json()) as SupabaseHookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (payload.type !== "INSERT" || !payload.record) {
    return NextResponse.json({
      ok: true,
      sent: false,
      reason: "non_insert",
      type: payload.type,
      table: payload.table,
    });
  }

  let buildError: string | null = null;
  const message = await buildMessage(payload).catch((err) => {
    buildError = err instanceof Error ? err.message : String(err);
    console.error("discord webhook build failed", err);
    return null;
  });
  if (!message) {
    return NextResponse.json({
      ok: true,
      sent: false,
      reason: buildError ? "build_threw" : "no_message",
      table: payload.table,
      buildError,
    });
  }

  try {
    const res = await fetch(discordUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("discord webhook returned", res.status, text);
      return NextResponse.json({
        ok: false,
        sent: false,
        reason: "discord_rejected",
        discordStatus: res.status,
        discordBody: text.slice(0, 500),
      });
    }
  } catch (err) {
    console.error("discord webhook fetch failed", err);
    return NextResponse.json({
      ok: false,
      sent: false,
      reason: "fetch_failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return NextResponse.json({ ok: true, sent: true, table: payload.table });
}

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://ck-ref.vercel.app";
}

function senderFor(profile: Profile | null) {
  if (!profile) return { username: "ck-ref" };
  return {
    username: profile.display_name.slice(0, 80),
    avatar_url: profile.avatar_path
      ? publicImageUrl(profile.avatar_path)
      : undefined,
  };
}

function colorInt(profile: Profile | null): number | undefined {
  if (!profile) return undefined;
  const m = profile.color.replace("#", "");
  const n = parseInt(m, 16);
  return Number.isFinite(n) ? n : undefined;
}

function snippet(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  return t.length > SNIPPET_LIMIT ? `${t.slice(0, SNIPPET_LIMIT)}…` : t;
}

type Embed = {
  description: string;
  color?: number;
  image?: { url: string };
};

type DiscordMessage = {
  username: string;
  avatar_url?: string;
  embeds: Embed[];
};

async function buildMessage(
  payload: SupabaseHookPayload,
): Promise<DiscordMessage | null> {
  const { table, record } = payload;
  if (!record) return null;
  const profiles = await fetchProfiles().catch(() => []);
  const site = siteUrl();
  const supabase = await createClient();

  switch (table) {
    case "notes":
      return buildNote(supabase, profiles, record, site);
    case "ref_annotations":
      return buildAnnotation(supabase, profiles, record, site);
    case "ref_ratings":
      return buildRating(supabase, profiles, record, site);
    case "refs":
      return buildRefUpload(profiles, record, site);
    case "project_updates":
      return buildProjectUpdate(supabase, profiles, record, site);
    default:
      return null;
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function buildNote(
  supabase: SupabaseClient,
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): Promise<DiscordMessage | null> {
  const author = String(record.author ?? "");
  const profile = findProfile(profiles, author);
  const isReply = Boolean(record.parent_id);
  const verb = isReply ? "답글을 남겼어요" : "노트를 남겼어요";
  const body = snippet(
    (record.body ?? record.pros ?? record.cons ?? "") as string,
  );

  const noteId = String(record.id);
  let targetLabel = "ref";
  let targetTitle = "untitled";
  let targetUrl = site;

  if (record.ref_id) {
    const { data } = await supabase
      .from("refs")
      .select("id, title")
      .eq("id", record.ref_id as string)
      .maybeSingle();
    if (!data) return null;
    targetLabel = "ref";
    targetTitle = ((data as { title: string | null }).title ?? "untitled");
    targetUrl = `${site}/ref/${(data as { id: string }).id}#note-${noteId}`;
  } else if (record.project_id) {
    const { data } = await supabase
      .from("projects")
      .select("id, title")
      .eq("id", record.project_id as string)
      .maybeSingle();
    if (!data) return null;
    targetLabel = "작업";
    targetTitle = (data as { title: string }).title;
    targetUrl = `${site}/wip/${(data as { id: string }).id}#note-${noteId}`;
  } else if (record.project_update_id) {
    const { data } = await supabase
      .from("project_updates")
      .select("project_id, projects(title)")
      .eq("id", record.project_update_id as string)
      .maybeSingle();
    if (!data) return null;
    type Row = {
      project_id: string;
      projects:
        | { title: string }
        | { title: string }[]
        | null;
    };
    const r = data as Row;
    const proj = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    targetLabel = "업데이트";
    targetTitle = proj?.title ?? "untitled";
    targetUrl = `${site}/wip/${r.project_id}#note-${noteId}`;
  } else {
    return null;
  }

  return {
    ...senderFor(profile),
    embeds: [
      {
        description:
          `**${targetLabel}에 ${verb}** — [${targetTitle}](${targetUrl})` +
          (body ? `\n> ${body}` : ""),
        color: colorInt(profile),
      },
    ],
  };
}

async function buildAnnotation(
  supabase: SupabaseClient,
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): Promise<DiscordMessage | null> {
  const profile = findProfile(profiles, String(record.author ?? ""));
  const annId = String(record.id);
  const body = snippet(record.body as string);
  let label = "ref";
  let title = "untitled";
  let url = site;

  if (record.ref_id) {
    const { data } = await supabase
      .from("refs")
      .select("id, title")
      .eq("id", record.ref_id as string)
      .maybeSingle();
    if (!data) return null;
    label = "ref";
    title = ((data as { title: string | null }).title ?? "untitled");
    url = `${site}/ref/${(data as { id: string }).id}#ann-${annId}`;
  } else if (record.project_update_id) {
    const { data } = await supabase
      .from("project_updates")
      .select("project_id, projects(title)")
      .eq("id", record.project_update_id as string)
      .maybeSingle();
    if (!data) return null;
    type Row = {
      project_id: string;
      projects: { title: string } | { title: string }[] | null;
    };
    const r = data as Row;
    const proj = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    label = "업데이트";
    title = proj?.title ?? "untitled";
    url = `${site}/wip/${r.project_id}#ann-${annId}`;
  } else {
    return null;
  }

  return {
    ...senderFor(profile),
    embeds: [
      {
        description:
          `**${label}에 주석** — [${title}](${url})` +
          (body ? `\n> ${body}` : ""),
        color: colorInt(profile),
      },
    ],
  };
}

async function buildRating(
  supabase: SupabaseClient,
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): Promise<DiscordMessage | null> {
  const profile = findProfile(profiles, String(record.user_key ?? ""));
  const stars = Number(record.stars ?? 0);
  const { data } = await supabase
    .from("refs")
    .select("id, title")
    .eq("id", record.ref_id as string)
    .maybeSingle();
  if (!data) return null;
  const title = (data as { title: string | null }).title ?? "untitled";
  const url = `${site}/ref/${(data as { id: string }).id}`;
  const filled = "★".repeat(stars);
  const empty = "☆".repeat(Math.max(0, 5 - stars));
  return {
    ...senderFor(profile),
    embeds: [
      {
        description: `**별점 ${filled}${empty}** — [${title}](${url})`,
        color: colorInt(profile),
      },
    ],
  };
}

function buildRefUpload(
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): DiscordMessage | null {
  const profile = findProfile(profiles, String(record.created_by ?? ""));
  const id = String(record.id);
  const title = (record.title as string | null) ?? "untitled";
  const url = `${site}/ref/${id}`;
  return {
    ...senderFor(profile),
    embeds: [
      {
        description: `**새 ref 업로드** — [${title}](${url})`,
        color: colorInt(profile),
        image: { url: publicImageUrl(record.image_path as string) },
      },
    ],
  };
}

async function buildProjectUpdate(
  supabase: SupabaseClient,
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): Promise<DiscordMessage | null> {
  const profile = findProfile(profiles, String(record.created_by ?? ""));
  const { data } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", record.project_id as string)
    .maybeSingle();
  if (!data) return null;
  const title = (data as { title: string }).title;
  const url = `${site}/wip/${(data as { id: string }).id}`;
  const body = snippet(record.body as string);
  return {
    ...senderFor(profile),
    embeds: [
      {
        description:
          `**작업 업데이트** — [${title}](${url})` +
          (body ? `\n> ${body}` : ""),
        color: colorInt(profile),
        image: { url: publicImageUrl(record.image_path as string) },
      },
    ],
  };
}
