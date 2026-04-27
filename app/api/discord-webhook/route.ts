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
//
// Note: every table that should produce a Discord message needs its own
// Database Webhook in Supabase. Currently expected: refs, notes,
// ref_annotations, ref_ratings, project_updates — all on INSERT, all pointing
// at this URL with the SUPABASE_WEBHOOK_SECRET as a Bearer header.

type SupabaseHookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

const SNIPPET_LIMIT = 280;

// Distinct color per event kind so the channel scans well at a glance. The
// actor's profile color still appears via the avatar override in the message
// header.
const EVENT_COLOR = {
  note: 0x3b82f6,
  reply: 0x64748b,
  annotation: 0xa855f7,
  rating: 0xeab308,
  ref_upload: 0x22c55e,
  project_update: 0xf97316,
} as const;

const EVENT_EMOJI = {
  note: "📝",
  reply: "💬",
  annotation: "✏️",
  rating: "⭐",
  ref_upload: "🆕",
  project_update: "🛠️",
} as const;

type EventKind = keyof typeof EVENT_COLOR;

// Only ref uploads and WIP updates ping the channel. Notes/replies/
// annotations/ratings stay silent — they're frequent and would be noisy.
const PING_EVERYONE: ReadonlySet<EventKind> = new Set(["ref_upload", "project_update"]);

type Built = {
  kind: EventKind;
  actorKey: string | null;
  description: string;
  imageUrl?: string;
};

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
  const profiles = await fetchProfiles().catch(() => [] as Profile[]);
  const built = await buildEvent(payload, profiles).catch((err) => {
    buildError = err instanceof Error ? err.message : String(err);
    console.error("discord webhook build failed", err);
    return null;
  });
  if (!built) {
    return NextResponse.json({
      ok: true,
      sent: false,
      reason: buildError ? "build_threw" : "no_message",
      table: payload.table,
      buildError,
    });
  }

  const actor = findProfile(profiles, built.actorKey);
  const ping = PING_EVERYONE.has(built.kind);

  const message = {
    ...senderFor(actor),
    ...(ping ? { content: "@everyone" } : {}),
    embeds: [
      {
        description: `${EVENT_EMOJI[built.kind]} ${built.description}`,
        color: EVENT_COLOR[built.kind],
        ...(built.imageUrl ? { image: { url: built.imageUrl } } : {}),
      },
    ],
    allowed_mentions: ping
      ? { parse: ["everyone"] as const }
      : { parse: [] as const },
  };

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

function snippet(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  return t.length > SNIPPET_LIMIT ? `${t.slice(0, SNIPPET_LIMIT)}…` : t;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function buildEvent(
  payload: SupabaseHookPayload,
  profiles: Profile[],
): Promise<Built | null> {
  const { table, record } = payload;
  if (!record) return null;
  const site = siteUrl();
  const supabase = await createClient();

  switch (table) {
    case "notes":
      return buildNote(supabase, profiles, record, site);
    case "ref_annotations":
      return buildAnnotation(supabase, record, site);
    case "ref_ratings":
      return buildRating(supabase, record, site);
    case "refs":
      return buildRefUpload(record, site);
    case "project_updates":
      return buildProjectUpdate(supabase, record, site);
    default:
      return null;
  }
}

async function buildNote(
  supabase: SupabaseClient,
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): Promise<Built | null> {
  const author = String(record.author ?? "");
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
    const r = data as { id: string; title: string | null };
    targetLabel = "ref";
    targetTitle = r.title ?? "untitled";
    targetUrl = `${site}/ref/${r.id}#note-${noteId}`;
  } else if (record.project_id) {
    const { data } = await supabase
      .from("projects")
      .select("id, title")
      .eq("id", record.project_id as string)
      .maybeSingle();
    if (!data) return null;
    const p = data as { id: string; title: string };
    targetLabel = "작업";
    targetTitle = p.title;
    targetUrl = `${site}/wip/${p.id}#note-${noteId}`;
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
    targetLabel = "업데이트";
    targetTitle = proj?.title ?? "untitled";
    targetUrl = `${site}/wip/${r.project_id}#update-${record.project_update_id as string}`;
  } else {
    return null;
  }

  const authorProfile = findProfile(profiles, author);
  const authorName = authorProfile?.display_name ?? author;

  return {
    kind: isReply ? "reply" : "note",
    actorKey: author,
    description:
      `**${authorName}**님이 ${targetLabel}에 ${verb} — [${targetTitle}](${targetUrl})` +
      (body ? `\n> ${body.replace(/\n/g, "\n> ")}` : ""),
  };
}

async function buildAnnotation(
  supabase: SupabaseClient,
  record: Record<string, unknown>,
  site: string,
): Promise<Built | null> {
  const author = String(record.author ?? "");
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
    const r = data as { id: string; title: string | null };
    label = "ref";
    title = r.title ?? "untitled";
    url = `${site}/ref/${r.id}#ann-${annId}`;
  } else if (record.project_update_id) {
    const { data } = await supabase
      .from("project_updates")
      .select("id, project_id, projects(title)")
      .eq("id", record.project_update_id as string)
      .maybeSingle();
    if (!data) return null;
    type Row = {
      id: string;
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
    kind: "annotation",
    actorKey: author,
    description:
      `**${label}에 주석** — [${title}](${url})` + (body ? `\n> ${body}` : ""),
  };
}

async function buildRating(
  supabase: SupabaseClient,
  record: Record<string, unknown>,
  site: string,
): Promise<Built | null> {
  const userKey = String(record.user_key ?? "");
  const stars = Number(record.stars ?? 0);
  const { data } = await supabase
    .from("refs")
    .select("id, title")
    .eq("id", record.ref_id as string)
    .maybeSingle();
  if (!data) return null;
  const r = data as { id: string; title: string | null };
  const title = r.title ?? "untitled";
  const url = `${site}/ref/${r.id}`;
  const filled = "★".repeat(stars);
  const empty = "☆".repeat(Math.max(0, 5 - stars));
  return {
    kind: "rating",
    actorKey: userKey,
    description: `**별점 ${filled}${empty}** — [${title}](${url})`,
  };
}

function buildRefUpload(
  record: Record<string, unknown>,
  site: string,
): Built {
  const id = String(record.id);
  const title = (record.title as string | null) ?? "untitled";
  const url = `${site}/ref/${id}`;
  return {
    kind: "ref_upload",
    actorKey: String(record.created_by ?? "") || null,
    description: `**새 ref 업로드** — [${title}](${url})`,
    imageUrl: publicImageUrl(record.image_path as string),
  };
}

async function buildProjectUpdate(
  supabase: SupabaseClient,
  record: Record<string, unknown>,
  site: string,
): Promise<Built | null> {
  const { data } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", record.project_id as string)
    .maybeSingle();
  if (!data) return null;
  const p = data as { id: string; title: string };
  const updateId = String(record.id);
  const url = `${site}/wip/${p.id}#update-${updateId}`;
  const body = snippet(record.body as string);
  return {
    kind: "project_update",
    actorKey: String(record.created_by ?? "") || null,
    description:
      `**작업 업데이트** — [${p.title}](${url})` + (body ? `\n> ${body}` : ""),
    imageUrl: publicImageUrl(record.image_path as string),
  };
}
