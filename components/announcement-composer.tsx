"use client";

import { Megaphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { relativeTime } from "@/lib/relativeTime";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/lib/types";

const DURATIONS = [
  { value: "1h", label: "1시간" },
  { value: "6h", label: "6시간" },
  { value: "1d", label: "하루" },
  { value: "1w", label: "일주일" },
] as const;

type Duration = (typeof DURATIONS)[number]["value"];

const POLL_INTERVAL_MS = 60_000;

function formatExpiry(iso: string): string {
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date(iso));
}

export function AnnouncementComposer() {
  const { nickname, hydrated } = useNickname();
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [duration, setDuration] = useState<Duration>("1d");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try {
      const res = await fetch("/api/announcements", { signal: ctrl.signal });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Announcement[] };
      setItems(data.items);
    } catch {
      // Network blip — try again on the next tick.
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !nickname) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
      inflight.current?.abort();
    };
  }, [hydrated, nickname, refresh]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [open, refresh]);

  async function submit() {
    if (!nickname) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setError("공지 내용을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed, author: nickname, duration }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "전송 실패");
      return;
    }
    setBody("");
    void refresh();
    // Tell the index banner (server-rendered) to repaint with the new
    // announcement on next nav. Fire a custom event so any listening
    // surface can refresh too.
    window.dispatchEvent(new CustomEvent("ck-ref:announcements-changed"));
  }

  async function remove(id: string) {
    if (!nickname) return;
    if (!window.confirm("이 공지를 내릴까요?")) return;
    const res = await fetch(
      `/api/announcements?id=${encodeURIComponent(id)}&author=${encodeURIComponent(nickname)}`,
      { method: "DELETE" },
    );
    if (!res.ok) return;
    void refresh();
    window.dispatchEvent(new CustomEvent("ck-ref:announcements-changed"));
  }

  if (!hydrated || !nickname) {
    return <span aria-hidden className="inline-block h-5 w-5" />;
  }

  const activeCount = items.length;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`공지 ${activeCount > 0 ? `(${activeCount}건 활성)` : ""}`}
        >
          <Megaphone className="size-4" />
          {activeCount > 0 ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[9px] font-medium leading-none text-white"
            >
              {activeCount > 9 ? "9+" : activeCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 max-w-[90vw] p-0"
      >
        <div className="border-b border-border/60 px-3 py-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            공지 작성
          </p>
        </div>
        <div className="flex flex-col gap-2 p-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="모두에게 알릴 내용..."
          />
          <div className="flex flex-wrap gap-1">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDuration(d.value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  duration === d.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button
            type="button"
            size="sm"
            disabled={busy || !body.trim()}
            onClick={() => void submit()}
          >
            {busy ? "올리는 중…" : "공지 올리기"}
          </Button>
        </div>
        <div className="border-t border-border/60">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              지금 떠있는 공지
            </p>
            {activeCount > 0 ? (
              <span className="font-mono text-[10px] text-muted-foreground">
                {activeCount}건
              </span>
            ) : null}
          </div>
          <ul className="max-h-[40vh] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 pb-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                활성 공지가 없어요
              </li>
            ) : (
              items.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-2 border-t border-border/40 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="line-clamp-3 text-xs text-foreground/80">
                      {a.body}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      @{a.created_by} · {relativeTime(a.created_at)} · ~{" "}
                      {formatExpiry(a.expires_at)}
                    </p>
                  </div>
                  {a.created_by === nickname ? (
                    <button
                      type="button"
                      onClick={() => void remove(a.id)}
                      aria-label="공지 내리기"
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
