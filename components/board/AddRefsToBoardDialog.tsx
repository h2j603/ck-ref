"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isVideoPath } from "@/lib/media";
import { useNickname } from "@/lib/nickname";
import { searchRefIdsClient } from "@/lib/refSearch";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { Ref } from "@/lib/types";

type RefLite = Pick<
  Ref,
  "id" | "title" | "image_path" | "image_width" | "image_height"
>;

const REF_LITE_COLUMNS = "id, title, image_path, image_width, image_height";

export function AddRefsToBoardDialog({
  boardId,
  existingIds,
  onAdded,
}: {
  boardId: string;
  existingIds: ReadonlySet<string>;
  onAdded: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<RefLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // iOS Safari + React: synthetic events miss composition keystrokes
  // (autocorrect / IME). Mirror the InspirationRefs picker — attach a
  // native input listener so live search fires on every keystroke.
  useEffect(() => {
    if (!open) return;
    const el = searchInputRef.current;
    if (!el) return;
    const handler = () => setQuery(el.value);
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, [open]);

  // Reset transient state every time the dialog closes so the next open
  // starts clean (no stale candidates or selection).
  useEffect(() => {
    if (open) return;
    setQuery("");
    setCandidates([]);
    setPending(new Set());
    setError(null);
  }, [open]);

  // Live search. Empty query → most recent refs (the same default the
  // upload form's blank state would show).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const trimmed = query.trim();
    setSearching(true);
    void (async () => {
      try {
        if (!trimmed) {
          const { data } = await supabase
            .from("refs")
            .select(REF_LITE_COLUMNS)
            .eq("board_only", false)
            .order("created_at", { ascending: false })
            .limit(36);
          if (cancelled) return;
          setCandidates(((data ?? []) as RefLite[]).filter(
            (r) => !existingIds.has(r.id),
          ));
          return;
        }
        const ids = await searchRefIdsClient(supabase, trimmed);
        const usable = [...ids].filter((id) => !existingIds.has(id));
        if (usable.length === 0) {
          if (!cancelled) setCandidates([]);
          return;
        }
        const { data } = await supabase
          .from("refs")
          .select(REF_LITE_COLUMNS)
          .eq("board_only", false)
          .in("id", usable.slice(0, 60));
        if (cancelled) return;
        setCandidates((data ?? []) as RefLite[]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, query, supabase, existingIds]);

  function toggle(id: string) {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (pending.size === 0) return;
    setBusy(true);
    setError(null);
    // Append to the end of the board — read the current max position so
    // new items don't collide with existing ones.
    const { data: maxRow } = await supabase
      .from("board_items")
      .select("position")
      .eq("board_id", boardId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const startPos = ((maxRow as { position: number } | null)?.position ?? -1) + 1;
    const rows = [...pending].map((refId, i) => ({
      board_id: boardId,
      ref_id: refId,
      position: startPos + i,
      added_by: nickname || null,
    }));
    const { error } = await supabase.from("board_items").insert(rows);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOpen(false);
    onAdded();
  }

  if (!hydrated || !nickname) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
        >
          <Plus className="size-3" /> 레퍼 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>레퍼 추가</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onCompositionEnd={(e) =>
                setQuery((e.target as HTMLInputElement).value)
              }
              onKeyUp={(e) =>
                setQuery((e.currentTarget as HTMLInputElement).value)
              }
              onBlur={(e) =>
                setQuery((e.currentTarget as HTMLInputElement).value)
              }
              placeholder="제목·태그·OCR·디자이너로 검색…"
            />
            {searching ? (
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              </div>
            ) : null}
          </div>
          {candidates.length > 0 ? (
            <ul className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
              {candidates.map((r) => {
                const selected = pending.has(r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      disabled={busy}
                      className="group relative block w-full overflow-hidden bg-muted text-left"
                      aria-pressed={selected}
                    >
                      <div
                        className="relative w-full"
                        style={{
                          aspectRatio: `${r.image_width ?? 4} / ${r.image_height ?? 5}`,
                        }}
                      >
                        {isVideoPath(r.image_path) ? (
                          <video
                            src={publicImageUrl(r.image_path)}
                            className="absolute inset-0 h-full w-full object-cover"
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <Image
                            src={publicImageUrl(r.image_path)}
                            alt={r.title ?? "ref"}
                            fill
                            sizes="120px"
                            className="object-cover"
                          />
                        )}
                        {selected ? (
                          <div className="absolute inset-0 flex items-start justify-end bg-foreground/30 p-1.5">
                            <span className="rounded-full bg-foreground px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-background">
                              ✓
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <p className="truncate px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.title ?? "untitled"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {searching ? "찾는 중…" : "결과 없음"}
            </p>
          )}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            닫기
          </Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || pending.size === 0}
          >
            {busy
              ? "추가 중…"
              : pending.size === 0
                ? "선택해주세요"
                : `${pending.size}개 추가`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
