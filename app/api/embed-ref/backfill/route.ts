import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import {
  embedImage,
  embeddingsConfigured,
  embeddingsProvider,
  vectorLiteral,
} from "@/lib/embedding";
import { isProfileKey } from "@/lib/profiles";
import { publicImageUrl, transformedImageUrl } from "@/lib/storage";

const EMBED_IMAGE_WIDTH = 512;
import { createClient } from "@/lib/supabase/server";

// One-shot backfill for refs that don't have an embedding yet. Walks up
// to BATCH rows, embeds each in series (provider rate limits apply), and
// reports counts.
//
// Two ways to call it:
//   1. Browser, signed in as a team profile — the in-app /admin/embed
//      page hits this on each click. Cookie auth.
//   2. Server-to-server with the SUPABASE_WEBHOOK_SECRET Bearer header,
//      e.g. from a cron / curl. Same handler, secret auth.

const BATCH = 25;
const PER_REQUEST_DELAY_MS = 1500; // be polite to free-tier providers

async function authorize(request: Request): Promise<boolean> {
  const rawSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (rawSecret) {
    const expected = rawSecret.trim().replace(/^Bearer\s+/i, "");
    const provided = (request.headers.get("authorization") ?? "")
      .trim()
      .replace(/^Bearer\s+/i, "");
    if (provided && provided === expected) return true;
  }
  const store = await cookies();
  const key = store.get(ARCHIVE_AUTH_COOKIE)?.value;
  return !!key && isProfileKey(key);
}

export async function POST(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!embeddingsConfigured()) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      reason: "embedding_provider_not_configured",
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refs")
    .select("id, image_path")
    .is("embedding", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as { id: string; image_path: string }[];
  let succeeded = 0;
  let failed = 0;
  // Surface the most recent failure reason so the admin UI can show it.
  // The whole batch usually fails for the same reason (e.g. provider
  // unreachable, model not deployed) so a single sample is enough to
  // diagnose; we don't need every row's error.
  let lastError: string | null = null;
  for (const row of rows) {
    const small = transformedImageUrl(row.image_path, {
      width: EMBED_IMAGE_WIDTH,
      resize: "contain",
    });
    let result = await embedImage(small);
    if (!result.ok && result.reason.startsWith("jina_400")) {
      result = await embedImage(publicImageUrl(row.image_path));
    }
    // On a token rate limit, sleep through the next minute and try once
    // more. The free tier resets per-minute, so a single backoff usually
    // gets us moving again instead of failing every remaining row.
    if (!result.ok && result.reason.startsWith("jina_429")) {
      await new Promise((r) => setTimeout(r, 65_000));
      result = await embedImage(small);
    }
    if (!result.ok) {
      failed += 1;
      lastError = result.reason;
      continue;
    }
    const { error: updErr } = await supabase
      .from("refs")
      .update({ embedding: vectorLiteral(result.embedding) })
      .eq("id", row.id);
    if (updErr) {
      failed += 1;
      lastError = `db:${updErr.message}`;
    } else {
      succeeded += 1;
    }
    if (PER_REQUEST_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, PER_REQUEST_DELAY_MS));
    }
  }
  return NextResponse.json({
    ok: true,
    processed: rows.length,
    succeeded,
    failed,
    moreLikely: rows.length === BATCH,
    lastError,
  });
}

// Quick stats for the in-app admin page.
export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const [{ count: total }, { count: missing }] = await Promise.all([
    supabase.from("refs").select("*", { count: "exact", head: true }),
    supabase
      .from("refs")
      .select("*", { count: "exact", head: true })
      .is("embedding", null),
  ]);
  return NextResponse.json({
    configured: embeddingsConfigured(),
    provider: embeddingsProvider(),
    total: total ?? 0,
    missing: missing ?? 0,
  });
}
