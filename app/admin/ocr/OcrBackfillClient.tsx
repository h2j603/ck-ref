"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { runOCR } from "@/lib/ocr";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

const BATCH_SIZE = 5;
const MAX_OCR_WIDTH = 1024;

// Downscale before handing the bitmap to Tesseract. Originals can be
// 4-6 MP which is overkill for OCR — anything past ~1024 wide just slows
// recognition. Returns the original blob if it's already smaller, so we
// don't waste a re-encode.
async function downscaleForOCR(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= MAX_OCR_WIDTH) {
      bitmap.close();
      return blob;
    }
    const scale = MAX_OCR_WIDTH / bitmap.width;
    const canvas = new OffscreenCanvas(
      MAX_OCR_WIDTH,
      Math.round(bitmap.height * scale),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return blob;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  } catch {
    // OffscreenCanvas / createImageBitmap unavailable on really old browsers.
    // OCR can still chew through the original — just slower.
    return blob;
  }
}

type Stats = {
  total: number;
  missing: number;
};

type RowLite = {
  id: string;
  image_path: string;
};

export function OcrBackfillClient() {
  const [supabase] = useState(() => createClient());
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const [totalRes, missingRes] = await Promise.all([
      supabase.from("refs").select("*", { count: "exact", head: true }),
      supabase
        .from("refs")
        .select("*", { count: "exact", head: true })
        .is("ocr_text", null),
    ]);
    if (totalRes.error) {
      setError(totalRes.error.message);
      return;
    }
    // Surface the missing-column case explicitly. Without this we'd just
    // show "Missing 0" and the page would look done, when in fact the
    // schema migration hasn't run yet.
    if (missingRes.error) {
      const msg = missingRes.error.message;
      setError(
        msg.includes("ocr_text")
          ? `refs.ocr_text 컬럼이 없습니다. 먼저 SQL 마이그레이션을 돌려주세요: alter table refs add column if not exists ocr_text text;`
          : msg,
      );
      setStats({ total: totalRes.count ?? 0, missing: 0 });
      return;
    }
    setStats({
      total: totalRes.count ?? 0,
      missing: missingRes.count ?? 0,
    });
  }, [supabase]);

  useEffect(() => {
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [line, ...prev].slice(0, 14));
  }, []);

  // One batch: fetch BATCH_SIZE rows missing ocr_text, OCR each, write back.
  // Returns a moreLikely flag so the auto-run loop knows whether to keep
  // going. Failures (image fetch, model load, supabase update) get logged
  // but don't abort the batch — we move to the next row so a single
  // 404'd image doesn't block everyone behind it.
  const runBatch = useCallback(async (): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    moreLikely: boolean;
  }> => {
    const { data, error: queryErr } = await supabase
      .from("refs")
      .select("id, image_path")
      .is("ocr_text", null)
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);
    if (queryErr) {
      setError(queryErr.message);
      return { processed: 0, succeeded: 0, failed: 0, moreLikely: false };
    }
    const rows = (data ?? []) as RowLite[];
    if (rows.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0, moreLikely: false };
    }

    let succeeded = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        // Public object URL — the storage transform endpoint is gated on
        // Supabase Pro, so we pull the original and downscale client-side
        // before OCR.
        const url = publicImageUrl(row.image_path);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const blob = await downscaleForOCR(await res.blob());
        const text = await runOCR(blob);
        const { error: updErr } = await supabase
          .from("refs")
          .update({ ocr_text: text || "" })
          .eq("id", row.id);
        if (updErr) throw updErr;
        succeeded += 1;
        appendLog(
          `✓ ${row.id.slice(0, 8)} — ${text ? `${text.length}자` : "텍스트 없음"}`,
        );
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : "unknown";
        appendLog(`✗ ${row.id.slice(0, 8)} — ${msg}`);
      }
    }
    return {
      processed: rows.length,
      succeeded,
      failed,
      moreLikely: rows.length === BATCH_SIZE,
    };
  }, [supabase, appendLog]);

  async function handleOneShot() {
    setBusy(true);
    const result = await runBatch();
    setBusy(false);
    appendLog(
      `— 배치 완료: ${result.succeeded} 성공 / ${result.failed} 실패 / ${
        result.moreLikely ? "더 남음" : "끝"
      }`,
    );
    void refresh();
  }

  useEffect(() => {
    if (!autoRun) return;
    let cancelled = false;
    void (async () => {
      while (!cancelled) {
        setBusy(true);
        const result = await runBatch();
        setBusy(false);
        if (cancelled) return;
        appendLog(
          `— 배치 완료: ${result.succeeded} 성공 / ${result.failed} 실패 / ${
            result.moreLikely ? "더 남음" : "끝"
          }`,
        );
        await refresh();
        if (!result.moreLikely) {
          setAutoRun(false);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoRun, runBatch, refresh, appendLog]);

  const done = stats !== null && stats.missing === 0;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-md border border-border/60 bg-muted/30 p-4">
        {stats ? (
          <div className="flex flex-col gap-1 font-mono text-xs">
            <p>
              <span className="text-muted-foreground">Total refs:</span>{" "}
              {stats.total}
            </p>
            <p>
              <span className="text-muted-foreground">Missing ocr_text:</span>{" "}
              <strong className={done ? "" : "text-foreground"}>
                {stats.missing}
              </strong>
            </p>
          </div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            상태 확인 중…
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void handleOneShot()}
          disabled={busy || autoRun || done}
        >
          {busy ? (
            <>
              <Loader2 className="size-3 animate-spin" /> 처리 중…
            </>
          ) : (
            `${BATCH_SIZE}개 처리`
          )}
        </Button>
        <Button
          type="button"
          variant={autoRun ? "default" : "outline"}
          onClick={() => setAutoRun((v) => !v)}
          disabled={done && !autoRun}
        >
          {autoRun ? "자동 진행 멈추기" : "끝까지 자동 진행"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void refresh()}>
          새로고침
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {log.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-md border border-border/40 bg-background p-3 font-mono text-[11px]">
          {log.map((line, i) => (
            <li key={i} className="text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
