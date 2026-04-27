"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Stats = { configured: boolean; total: number; missing: number };
type RunResult = {
  ok: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  moreLikely?: boolean;
  reason?: string;
};

export function EmbedAdminClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/embed-ref/backfill", { method: "GET" });
      if (!res.ok) {
        setError(`stats ${res.status}`);
        return;
      }
      setStats((await res.json()) as Stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "stats failed");
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [refresh]);

  const runOnce = useCallback(async (): Promise<RunResult | null> => {
    try {
      const res = await fetch("/api/embed-ref/backfill", { method: "POST" });
      if (!res.ok) {
        setError(`run ${res.status}`);
        return null;
      }
      return (await res.json()) as RunResult;
    } catch (err) {
      setError(err instanceof Error ? err.message : "run failed");
      return null;
    }
  }, []);

  const appendLog = useCallback((r: RunResult) => {
    setLog((prev) =>
      [
        r.reason
          ? `skipped: ${r.reason}`
          : `processed ${r.processed} (ok ${r.succeeded}, fail ${r.failed})${r.moreLikely ? " — more left" : " — done"}`,
        ...prev,
      ].slice(0, 12),
    );
  }, []);

  // One round-trip click. Used by the "한 배치 처리" button.
  async function handleOneShot() {
    setBusy(true);
    setError(null);
    const result = await runOnce();
    setBusy(false);
    if (result) appendLog(result);
    void refresh();
  }

  // Auto-loop until there's nothing left or the provider gives up.
  useEffect(() => {
    if (!autoRun) return;
    let cancelled = false;
    void (async () => {
      while (!cancelled) {
        setBusy(true);
        const result = await runOnce();
        setBusy(false);
        if (cancelled) return;
        if (!result) {
          setAutoRun(false);
          return;
        }
        appendLog(result);
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
  }, [autoRun, runOnce, refresh, appendLog]);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-md border border-border/60 bg-muted/30 p-4">
        {stats ? (
          <div className="flex flex-col gap-1 font-mono text-xs">
            <p>
              <span className="text-muted-foreground">Provider:</span>{" "}
              <span className={stats.configured ? "" : "text-destructive"}>
                {stats.configured ? "configured" : "not configured"}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Total refs:</span>{" "}
              {stats.total}
            </p>
            <p>
              <span className="text-muted-foreground">Missing embedding:</span>{" "}
              <strong className={stats.missing === 0 ? "" : "text-foreground"}>
                {stats.missing}
              </strong>
            </p>
          </div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            상태 확인 중…
          </p>
        )}
        {!stats?.configured ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Vercel 환경변수 <code className="font-mono">HF_API_TOKEN</code> 을
            설정한 뒤 새로고침하세요.
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void handleOneShot()}
          disabled={busy || autoRun || !stats?.configured || stats.missing === 0}
        >
          {busy ? (
            <>
              <Loader2 className="size-3 animate-spin" /> 처리 중…
            </>
          ) : (
            "25개 처리"
          )}
        </Button>
        <Button
          type="button"
          variant={autoRun ? "default" : "outline"}
          onClick={() => setAutoRun((v) => !v)}
          disabled={!stats?.configured || (stats.missing === 0 && !autoRun)}
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
