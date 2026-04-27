import { NextResponse } from "next/server";

import { appendDiscordTrust } from "@/lib/discordTrust";
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
  ref_link: 0x14b8a6,
  update_ref_link: 0x0d9488,
  event_create: 0x6366f1,
} as const;

const EVENT_EMOJI = {
  note: "📝",
  reply: "💬",
  annotation: "✏️",
  rating: "⭐",
  ref_upload: "🆕",
  project_update: "🛠️",
  ref_link: "🔗",
  update_ref_link: "🪡",
  event_create: "📅",
} as const;

type EventKind = keyof typeof EVENT_COLOR;

// Only new ref uploads and WIP updates ping the channel — those are the
// rare, "everyone should look" events. Everything else (notes, replies,
// annotations, ratings, ref-attaches) hits Discord and the bell silently.
const PING_EVERYONE: ReadonlySet<EventKind> = new Set([
  "ref_upload",
  "project_update",
]);

type Built = {
  kind: EventKind;
  actorKey: string | null;
  description: string;
  // The in-app permalink for this event. The Discord embed already encodes
  // it inside `description`, but we keep it separately so the notifications
  // fanout can use it as the click-through target. Must be a path starting
  // with "/" (no host, no ?d= token — those are Discord-only).
  link: string;
  // Plaintext snippet of the body (note text, annotation text, etc) used
  // for the notifications fanout. Discord uses the markdown description.
  body?: string;
  // imageUrl renders full-width at the bottom of the embed (used when the
  // upload itself is the message). thumbnailUrl renders small at the top-
  // right (used to give context for notes/annotations/ratings).
  imageUrl?: string;
  thumbnailUrl?: string;
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
        ...(built.thumbnailUrl ? { thumbnail: { url: built.thumbnailUrl } } : {}),
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

  // Fan out to in-app notifications: one row per non-actor profile. Failures
  // here don't block the Discord delivery — the channel feed is the source of
  // truth, the bell is a convenience.
  await fanoutNotifications(built, profiles, payload).catch((err) => {
    console.error("notifications fanout failed", err);
  });

  return NextResponse.json({ ok: true, sent: true, table: payload.table });
}

async function fanoutNotifications(
  built: Built,
  profiles: Profile[],
  payload: SupabaseHookPayload,
): Promise<void> {
  if (profiles.length === 0) return;
  const targetId = payload.record?.id;
  if (typeof targetId !== "string") return;
  const recipients = profiles
    .map((p) => p.key)
    .filter((k) => k !== built.actorKey);
  if (recipients.length === 0) return;
  const supabase = await createClient();
  const rows = recipients.map((recipient) => ({
    recipient,
    actor: built.actorKey,
    kind: built.kind,
    target_type: payload.table,
    target_id: targetId,
    body: built.body ?? null,
    link: built.link,
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    console.error("notifications insert failed", error.message);
  }
}

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://ck-ref.vercel.app";
}

function senderFor(profile: Profile | null) {
  if (!profile) return { username: "CK Ref." };
  // The webhook posts as the actor's "shadow" — distinct from the actual
  // user typing in Discord, but still attached to their identity. 80 char
  // cap is Discord's webhook username limit.
  return {
    username: `${profile.display_name.slice(0, 75)}의 그림자`,
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
    case "project_refs":
      return buildRefLink(supabase, profiles, record, site);
    case "project_update_refs":
      return buildUpdateRefLink(supabase, profiles, record, site);
    case "events":
      return buildEventCreate(supabase, profiles, record, site);
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
  let targetPath = "/";
  let thumbnailPath: string | null = null;

  if (record.ref_id) {
    const { data } = await supabase
      .from("refs")
      .select("id, title, image_path")
      .eq("id", record.ref_id as string)
      .maybeSingle();
    if (!data) return null;
    const r = data as { id: string; title: string | null; image_path: string | null };
    targetLabel = "ref";
    targetTitle = r.title ?? "untitled";
    targetPath = `/ref/${r.id}#note-${noteId}`;
    targetUrl = appendDiscordTrust(`${site}${targetPath}`);
    thumbnailPath = r.image_path;
  } else if (record.project_id) {
    // Projects don't have their own image. Use the latest project_update's
    // image as the cover (matches the WIP list thumbnail logic).
    const { data } = await supabase
      .from("projects")
      .select("id, title, project_updates(image_path, created_at)")
      .eq("id", record.project_id as string)
      .order("created_at", { foreignTable: "project_updates", ascending: false })
      .limit(1, { foreignTable: "project_updates" })
      .maybeSingle();
    if (!data) return null;
    type Row = {
      id: string;
      title: string;
      project_updates: { image_path: string; created_at: string }[] | null;
    };
    const p = data as Row;
    targetLabel = "작업";
    targetTitle = p.title;
    targetPath = `/wip/${p.id}#note-${noteId}`;
    targetUrl = appendDiscordTrust(`${site}${targetPath}`);
    thumbnailPath = p.project_updates?.[0]?.image_path ?? null;
  } else if (record.project_update_id) {
    const { data } = await supabase
      .from("project_updates")
      .select("project_id, image_path, projects(title)")
      .eq("id", record.project_update_id as string)
      .maybeSingle();
    if (!data) return null;
    type Row = {
      project_id: string;
      image_path: string | null;
      projects: { title: string } | { title: string }[] | null;
    };
    const r = data as Row;
    const proj = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    targetLabel = "업데이트";
    targetTitle = proj?.title ?? "untitled";
    targetPath = `/wip/${r.project_id}#update-${record.project_update_id as string}`;
    targetUrl = appendDiscordTrust(`${site}${targetPath}`);
    thumbnailPath = r.image_path;
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
    link: targetPath,
    body: body ?? undefined,
    thumbnailUrl: thumbnailPath ? publicImageUrl(thumbnailPath) : undefined,
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
  let path = "/";
  let thumbnailPath: string | null = null;

  if (record.ref_id) {
    const { data } = await supabase
      .from("refs")
      .select("id, title, image_path")
      .eq("id", record.ref_id as string)
      .maybeSingle();
    if (!data) return null;
    const r = data as { id: string; title: string | null; image_path: string | null };
    label = "ref";
    title = r.title ?? "untitled";
    path = `/ref/${r.id}#ann-${annId}`;
    url = appendDiscordTrust(`${site}${path}`);
    thumbnailPath = r.image_path;
  } else if (record.ref_image_id) {
    // Annotation on a ref's extra image. Resolve back to the parent ref so
    // the link can deeplink to the page (the image itself doesn't have a
    // standalone route — it's stacked under the cover on /ref/<id>).
    const { data } = await supabase
      .from("ref_images")
      .select("id, image_path, ref:refs(id, title)")
      .eq("id", record.ref_image_id as string)
      .maybeSingle();
    if (!data) return null;
    type Row = {
      id: string;
      image_path: string | null;
      ref: { id: string; title: string | null } | { id: string; title: string | null }[] | null;
    };
    const row = data as Row;
    const ref = Array.isArray(row.ref) ? row.ref[0] : row.ref;
    if (!ref) return null;
    label = "ref";
    title = ref.title ?? "untitled";
    path = `/ref/${ref.id}#ann-${annId}`;
    url = appendDiscordTrust(`${site}${path}`);
    thumbnailPath = row.image_path;
  } else if (record.project_update_id) {
    const { data } = await supabase
      .from("project_updates")
      .select("id, project_id, image_path, projects(title)")
      .eq("id", record.project_update_id as string)
      .maybeSingle();
    if (!data) return null;
    type Row = {
      id: string;
      project_id: string;
      image_path: string | null;
      projects: { title: string } | { title: string }[] | null;
    };
    const r = data as Row;
    const proj = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    label = "업데이트";
    title = proj?.title ?? "untitled";
    path = `/wip/${r.project_id}#ann-${annId}`;
    url = appendDiscordTrust(`${site}${path}`);
    thumbnailPath = r.image_path;
  } else {
    return null;
  }

  return {
    kind: "annotation",
    actorKey: author,
    description:
      `**${label}에 주석** — [${title}](${url})` + (body ? `\n> ${body}` : ""),
    link: path,
    body: body ?? undefined,
    thumbnailUrl: thumbnailPath ? publicImageUrl(thumbnailPath) : undefined,
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
    .select("id, title, image_path")
    .eq("id", record.ref_id as string)
    .maybeSingle();
  if (!data) return null;
  const r = data as { id: string; title: string | null; image_path: string | null };
  const title = r.title ?? "untitled";
  const path = `/ref/${r.id}`;
  const url = appendDiscordTrust(`${site}${path}`);
  const filled = "★".repeat(stars);
  const empty = "☆".repeat(Math.max(0, 5 - stars));
  return {
    kind: "rating",
    actorKey: userKey,
    description: `**별점 ${filled}${empty}** — [${title}](${url})`,
    link: path,
    body: `${filled}${empty}`,
    thumbnailUrl: r.image_path ? publicImageUrl(r.image_path) : undefined,
  };
}

function buildRefUpload(
  record: Record<string, unknown>,
  site: string,
): Built {
  const id = String(record.id);
  const title = (record.title as string | null) ?? "untitled";
  const path = `/ref/${id}`;
  const url = appendDiscordTrust(`${site}${path}`);
  return {
    kind: "ref_upload",
    actorKey: String(record.created_by ?? "") || null,
    description: `**새 ref 업로드** — [${title}](${url})`,
    link: path,
    body: title,
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
  const path = `/wip/${p.id}#update-${updateId}`;
  const url = appendDiscordTrust(`${site}${path}`);
  const body = snippet(record.body as string);
  return {
    kind: "project_update",
    actorKey: String(record.created_by ?? "") || null,
    description:
      `**작업 업데이트** — [${p.title}](${url})` + (body ? `\n> ${body}` : ""),
    link: path,
    body: body ?? undefined,
    imageUrl: publicImageUrl(record.image_path as string),
  };
}

async function buildRefLink(
  supabase: SupabaseClient,
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): Promise<Built | null> {
  const projectId = record.project_id as string | undefined;
  const refId = record.ref_id as string | undefined;
  if (!projectId || !refId) return null;
  const [{ data: proj }, { data: ref }] = await Promise.all([
    supabase.from("projects").select("id, title").eq("id", projectId).maybeSingle(),
    supabase
      .from("refs")
      .select("id, title, image_path")
      .eq("id", refId)
      .maybeSingle(),
  ]);
  if (!proj || !ref) return null;
  const p = proj as { id: string; title: string };
  const r = ref as { id: string; title: string | null; image_path: string | null };
  const path = `/wip/${p.id}`;
  const url = appendDiscordTrust(`${site}${path}`);
  const reason = snippet(record.reason as string);
  const actorKey = String(record.added_by ?? "") || null;
  const actorProfile = findProfile(profiles, actorKey);
  const actorName = actorProfile?.display_name ?? actorKey ?? "누군가";
  const refTitle = r.title ?? "untitled";
  return {
    kind: "ref_link",
    actorKey,
    description:
      `**${actorName}**님이 [${p.title}](${url})에 ref **${refTitle}** 를 영감으로 추가했어요` +
      (reason ? `\n> ${reason.replace(/\n/g, "\n> ")}` : ""),
    link: path,
    body: reason ?? refTitle,
    thumbnailUrl: r.image_path ? publicImageUrl(r.image_path) : undefined,
  };
}

async function buildUpdateRefLink(
  supabase: SupabaseClient,
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): Promise<Built | null> {
  const updateId = record.project_update_id as string | undefined;
  const refId = record.ref_id as string | undefined;
  if (!updateId || !refId) return null;
  const [{ data: upd }, { data: ref }] = await Promise.all([
    supabase
      .from("project_updates")
      .select("id, project_id, projects(title)")
      .eq("id", updateId)
      .maybeSingle(),
    supabase
      .from("refs")
      .select("id, title, image_path")
      .eq("id", refId)
      .maybeSingle(),
  ]);
  if (!upd || !ref) return null;
  type UpdRow = {
    id: string;
    project_id: string;
    projects: { title: string } | { title: string }[] | null;
  };
  const u = upd as UpdRow;
  const r = ref as { id: string; title: string | null; image_path: string | null };
  const projTitle =
    (Array.isArray(u.projects) ? u.projects[0]?.title : u.projects?.title) ??
    "untitled";
  const path = `/wip/${u.project_id}#update-${u.id}`;
  const url = appendDiscordTrust(`${site}${path}`);
  const reason = snippet(record.reason as string);
  const actorKey = String(record.added_by ?? "") || null;
  const actorProfile = findProfile(profiles, actorKey);
  const actorName = actorProfile?.display_name ?? actorKey ?? "누군가";
  const refTitle = r.title ?? "untitled";
  return {
    kind: "update_ref_link",
    actorKey,
    description:
      `**${actorName}**님이 [${projTitle}](${url})의 업데이트에 ref **${refTitle}** 를 참고로 추가했어요` +
      (reason ? `\n> ${reason.replace(/\n/g, "\n> ")}` : ""),
    link: path,
    body: reason ?? refTitle,
    thumbnailUrl: r.image_path ? publicImageUrl(r.image_path) : undefined,
  };
}

async function buildEventCreate(
  supabase: SupabaseClient,
  profiles: Profile[],
  record: Record<string, unknown>,
  site: string,
): Promise<Built | null> {
  const title = String(record.title ?? "untitled");
  const startsAt = record.starts_at as string | undefined;
  if (!startsAt) return null;
  const allDay = Boolean(record.all_day);
  const projectId = (record.project_id as string | null) ?? null;

  let projectTitle: string | null = null;
  if (projectId) {
    const { data } = await supabase
      .from("projects")
      .select("title")
      .eq("id", projectId)
      .maybeSingle();
    if (data) projectTitle = (data as { title: string }).title;
  }

  // Format the start in Asia/Seoul so the message reads naturally for the
  // team. All-day events show the date only.
  const startDate = new Date(startsAt);
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    ...(allDay
      ? {}
      : { hour: "2-digit", minute: "2-digit", hour12: false }),
  });
  const when = fmt.format(startDate) + (allDay ? " · 종일" : "");

  const path = "/calendar";
  const url = appendDiscordTrust(`${site}${path}`);
  const actorKey = String(record.created_by ?? "") || null;
  const actorProfile = findProfile(profiles, actorKey);
  const actorName = actorProfile?.display_name ?? actorKey ?? "누군가";

  return {
    kind: "event_create",
    actorKey,
    description:
      `**${actorName}**님이 일정을 등록했어요 — [${title}](${url})\n` +
      `> ${when}${projectTitle ? ` · ${projectTitle}` : ""}` +
      (record.body ? `\n> ${snippet(record.body as string) ?? ""}` : ""),
    link: path,
    body: title,
  };
}
