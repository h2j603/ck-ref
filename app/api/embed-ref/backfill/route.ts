import { NextResponse } from "next/server";

import {
  embedImage,
  embeddingsConfigured,
  vectorLiteral,
} from "@/lib/embedding";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

// One-shot backfill for refs that don't have an embedding yet. Walks up
// to BATCH rows, embeds each in series (provider rate limits apply), and
// reports counts. Run it after enabling the embedding provider — or
// re-run anytime to top up.
//
// Authenticated by SUPABASE_WEBHOOK_SECRET so it isn't trivially
// callable from the public web. Hit with:
//   curl -X POST -H 'Authorization: Bearer <secret>' \
//     https://<site>/api/embed-ref/backfill

const BATCH = 25;
const PER_REQUEST_DELAY_MS = 1500; // be polite to free-tier providers

export async function POST(request: Request) {
  const rawSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!rawSecret) {
    return NextResponse.json({ error: "secret not configured" }, { status: 500 });
  }
  const expected = rawSecret.trim().replace(/^Bearer\s+/i, "");
  const provided = (request.headers.get("authorization") ?? "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  if (!provided || provided !== expected) {
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
  for (const row of rows) {
    const vec = await embedImage(publicImageUrl(row.image_path));
    if (!vec) {
      failed += 1;
      continue;
    }
    const { error: updErr } = await supabase
      .from("refs")
      .update({ embedding: vectorLiteral(vec) })
      .eq("id", row.id);
    if (updErr) {
      failed += 1;
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
  });
}
