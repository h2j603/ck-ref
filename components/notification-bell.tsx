"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { NicknamePill } from "@/components/nickname-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNickname } from "@/lib/nickname";
import { relativeTime } from "@/lib/relativeTime";
import { cn } from "@/lib/utils";
import type { Notification, NotificationKind } from "@/lib/types";

const KIND_LABEL: Record<NotificationKind, string> = {
  note: "노트",
  reply: "답글",
  annotation: "주석",
  rating: "별점",
  ref_upload: "새 ref",
  project_update: "업데이트",
};

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const { nickname, hydrated } = useNickname();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!nickname) return;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try {
      const res = await fetch("/api/notifications", { signal: ctrl.signal });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: Notification[];
        unreadCount: number;
      };
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      // Network blip or aborted fetch — try again next interval.
    }
  }, [nickname]);

  useEffect(() => {
    if (!hydrated || !nickname) return;
    // Defer the initial fetch off the synchronous effect tick to avoid the
    // setState-in-effect lint rule and to play nicely with concurrent React.
    const initial = window.setTimeout(() => void refresh(), 0);
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      inflight.current?.abort();
    };
  }, [hydrated, nickname, refresh]);

  // Refresh when the dropdown opens so the list is fresh.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(id);
  }, [open, refresh]);

  async function markAllRead() {
    if (!nickname || unread === 0) return;
    const previous = items;
    setItems((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
    );
    setUnread(0);
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (!res.ok) {
      // Roll back on failure so the badge stays accurate.
      setItems(previous);
      void refresh();
    }
  }

  async function handleClick(n: Notification) {
    if (!n.read_at) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
      void fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [n.id] }),
      });
    }
    setOpen(false);
  }

  if (!hydrated || !nickname) {
    return <span aria-hidden className="inline-block h-5 w-5" />;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`알림 ${unread > 0 ? `(${unread} 안 읽음)` : ""}`}
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-foreground px-1 font-mono text-[9px] font-medium leading-none text-background"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 max-w-[90vw] p-0"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            알림
          </p>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              모두 읽음
            </button>
          ) : null}
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              아직 알림이 없어요
            </li>
          ) : (
            items.map((n) => (
              <li key={n.id} className="border-b border-border/40 last:border-b-0">
                <Link
                  href={n.link}
                  onClick={() => void handleClick(n)}
                  className={cn(
                    "flex flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-muted/50",
                    !n.read_at && "bg-muted/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-mono uppercase tracking-wider">
                      <NicknamePill nickname={n.actor} />
                      <span>·</span>
                      <span>{KIND_LABEL[n.kind]}</span>
                    </span>
                    <span className="font-mono">{relativeTime(n.created_at)}</span>
                  </div>
                  {n.body ? (
                    <p className="line-clamp-2 text-xs text-foreground/80">
                      {n.body}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))
          )}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
