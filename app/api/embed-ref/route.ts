import { NextResponse } from "next/server";

import {
  embedImage,
  embeddingsConfigured,
  vectorLiteral,
} from "@/lib/embedding";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

// Compute and persist an image embedding for a single ref. The upload
// flow fires this off after the ref row is created (best-effort) so the
// user doesn't wait. The backfill route reuses the same helper to walk
// every ref that's still missing one.
//
// Returns 200 with `{ skipped: true, reason }` rather than an error when
// embeddings aren't configured — callers (upload page, backfill loop)
// treat this as "fine, just no visual similarity yet".

export async function POST(request: Request) {
  let payload: { id?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const id = typeof payload.id === "string" ? payload.id : null;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (!embeddingsConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "embedding_provider_not_configured",
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refs")
    .select("id, image_path, embedding")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const row = data as {
    id: string;
    image_path: string;
    embedding: number[] | null;
  };
  if (row.embedding) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already_embedded" });
  }

  const result = await embedImage(publicImageUrl(row.image_path));
  if (!result.ok) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: result.reason,
    });
  }
  const { error: updErr } = await supabase
    .from("refs")
    .update({ embedding: vectorLiteral(result.embedding) })
    .eq("id", row.id);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, dim: result.embedding.length });
}
