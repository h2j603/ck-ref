"use client";

import { Pencil, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Masonry from "react-masonry-css";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AddRefsToBoardDialog } from "@/components/board/AddRefsToBoardDialog";
import { BoardImageUploadButton } from "@/components/board/BoardImageUploadButton";
import { Button } from "@/components/ui/button";
import { useColumnPref, type ColumnCount } from "@/lib/columnPref";
import { isVideoPath } from "@/lib/media";
import { useNickname } from "@/lib/nickname";
import type { BoardRef } from "@/lib/queries";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function breakpointsFor(cols: ColumnCount) {
  return { default: cols };
}

// Fit is now a 0-100 percentage rendered as a draggable bar under each
// card; the colour-coded border has been dropped in favour of the bar
// itself doing the indicating.

export function BoardItemsGrid({
  boardId,
  initialRefs,
}: {
  boardId: string;
  initialRefs: BoardRef[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const { columns } = useColumnPref();
  const { nickname, hydrated } = useNickname();
  const [refs, setRefs] = useState<BoardRef[]>(initialRefs);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "관리" mode reveals per-card delete X. Off by default so the moodboard
  // reads as a viewing surface; the toggle lives next to the upload /
  // add-ref buttons in the action row.
  const [manageMode, setManageMode] = useState(false);
  // Which card's fit chip is currently expanded into a slider. The chip
  // shows a compact "62%" overlay by default and only one card edits at
  // a time — outside taps and ESC collapse it back.
  const [editingFit, setEditingFit] = useState<string | null>(null);
  // Board-only refs don't have a /ref/<id> view worth navigating to
  // (no metadata, no notes, etc.) — clicking them just opens the
  // image full-size in a lightbox.
  const [lightbox, setLightbox] = useState<BoardRef | null>(null);

  const closeLightbox = useCallback(() => setLightbox(null), []);
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox]);

  // Outside-click / ESC dismissal for the fit popover.
  useEffect(() => {
    if (!editingFit) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('[data-fit-popover="true"]')) {
        setEditingFit(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditingFit(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [editingFit]);

  // Sync local state with the server-rendered list. After adding new
  // refs we router.refresh(), which re-runs the RSC and feeds a new
  // initialRefs prop in; without this effect the state would stay
  // pinned to the first mount's snapshot.
  useEffect(() => {
    setRefs(initialRefs);
  }, [initialRefs]);

  const existingIds = useMemo(
    () => new Set(refs.map((r) => r.id)),
    [refs],
  );

  async function remove(refId: string) {
    if (!window.confirm("이 ref를 보드에서 빼낼까요?")) return;
    setError(null);
    setRemoving(refId);
    const { error } = await supabase
      .from("board_items")
      .delete()
      .eq("board_id", boardId)
      .eq("ref_id", refId);
    setRemoving(null);
    if (error) {
      setError(error.message);
      return;
    }
    setRefs((prev) => prev.filter((r) => r.id !== refId));
  }

  async function setFit(refId: string, fit: number) {
    // Optimistic — the moodboard reads as a glance grid, so a half-
    // second round trip before the border updates would feel laggy.
    setRefs((prev) => prev.map((r) => (r.id === refId ? { ...r, fit } : r)));
    const { error } = await supabase
      .from("board_items")
      .update({ fit })
      .eq("board_id", boardId)
      .eq("ref_id", refId);
    if (error) {
      setError(error.message);
      // Revert by re-fetching from the server.
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {hydrated && nickname ? (
        <div className="flex flex-wrap items-start justify-end gap-2">
          <Button
            type="button"
            variant={manageMode ? "default" : "outline"}
            size="sm"
            onClick={() => setManageMode((v) => !v)}
            className="h-7 px-2 text-[11px]"
          >
            <Pencil className="size-3" />
            {manageMode ? "완료" : "관리"}
          </Button>
          <BoardImageUploadButton
            boardId={boardId}
            onUploaded={() => router.refresh()}
          />
          <AddRefsToBoardDialog
            boardId={boardId}
            existingIds={existingIds}
            onAdded={() => router.refresh()}
          />
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {refs.length === 0 ? (
        <p className="py-32 text-center font-mono text-xs text-muted-foreground">
          아직 보드에 ref가 없습니다.
        </p>
      ) : (
      <Masonry
        breakpointCols={breakpointsFor(columns)}
        className="masonry-grid"
        columnClassName="masonry-grid_column"
      >
        {refs.map((ref) => {
          const w = ref.image_width ?? 4;
          const h = ref.image_height ?? 5;
          const media = (
            <div
              className="relative w-full"
              style={{ aspectRatio: `${w} / ${h}` }}
            >
              {isVideoPath(ref.image_path) ? (
                <video
                  src={publicImageUrl(ref.image_path)}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : (
                <Image
                  src={publicImageUrl(ref.image_path)}
                  alt={ref.title ?? "untitled"}
                  fill
                  sizes="(max-width: 480px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                  className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                />
              )}
            </div>
          );
          return (
            <div
              key={ref.id}
              className="group relative block overflow-hidden bg-muted"
            >
              {ref.board_only ? (
                <button
                  type="button"
                  onClick={() => setLightbox(ref)}
                  className="block w-full"
                  aria-label="이미지 크게 보기"
                >
                  {media}
                </button>
              ) : (
                <Link href={`/ref/${ref.id}`} className="block">
                  {media}
                </Link>
              )}
              <FitChip
                fit={ref.fit}
                isEditing={editingFit === ref.id}
                editable={Boolean(hydrated && nickname)}
                onOpen={() => setEditingFit(ref.id)}
                onCommit={(n) => void setFit(ref.id, n)}
              />
              {hydrated && nickname && manageMode ? (
                <button
                  type="button"
                  onClick={() => remove(ref.id)}
                  disabled={removing !== null}
                  className="absolute right-1 top-1 rounded-full bg-background/95 p-1 text-muted-foreground shadow-sm hover:bg-background hover:text-destructive disabled:opacity-40"
                  aria-label="remove from board"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          );
        })}
      </Masonry>
      )}
      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeLightbox}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
          // The lightbox sits above everything, including fit dots.
        >
          <button
            type="button"
            onClick={closeLightbox}
            aria-label="close"
            className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="size-4" />
          </button>
          {isVideoPath(lightbox.image_path) ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={publicImageUrl(lightbox.image_path)}
              className="object-contain"
              style={{ maxHeight: "90vh", maxWidth: "92vw" }}
              controls
              autoPlay
              loop
              playsInline
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicImageUrl(lightbox.image_path)}
              alt={lightbox.title ?? "image"}
              className="object-contain"
              style={{ maxHeight: "90vh", maxWidth: "92vw" }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

// Compact fit affordance pinned to the top-left of each card. Reads as
// a single "62%" pill by default — taking up roughly the same footprint
// as the X delete button on the opposite corner — and expands inline
// into a small range slider when the user taps it. Outside taps / ESC
// collapse it again (handled by the parent so only one card edits at a
// time). Read-only viewers see the percentage but can't open the slider.
function FitChip({
  fit,
  isEditing,
  editable,
  onOpen,
  onCommit,
}: {
  fit: number;
  isEditing: boolean;
  editable: boolean;
  onOpen: () => void;
  onCommit: (next: number) => void;
}) {
  const [local, setLocal] = useState(fit);
  // Re-sync local mirror whenever the server value changes or the
  // chip toggles (so a re-open starts from the current persisted fit).
  useEffect(() => setLocal(fit), [fit, isEditing]);

  function commit() {
    if (local !== fit) onCommit(local);
  }

  // Hide entirely for read-only viewers when there's nothing to read.
  if (!editable && fit === 0) return null;

  return (
    <div
      data-fit-popover="true"
      className="absolute left-1 top-1 z-20"
      onClick={(e) => e.stopPropagation()}
    >
      {isEditing ? (
        <div className="flex items-center gap-2 rounded-full bg-background/95 px-2.5 py-1 shadow-md ring-1 ring-border/40">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={local}
            onChange={(e) => setLocal(Number(e.target.value))}
            onPointerUp={commit}
            onTouchEnd={commit}
            onKeyUp={commit}
            aria-label={`fit ${local}%`}
            className="h-3 w-32 accent-foreground"
          />
          <span className="w-8 text-right font-mono text-[10px] tabular-nums">
            {local}%
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (editable) onOpen();
          }}
          disabled={!editable}
          className={cn(
            "rounded-full bg-background/90 px-2 py-0.5 font-mono text-[10px] tabular-nums shadow-sm transition-colors",
            fit > 0 ? "text-foreground" : "text-muted-foreground",
            editable ? "cursor-pointer hover:bg-background" : "cursor-default",
          )}
        >
          {fit > 0 ? `${fit}%` : "fit?"}
        </button>
      )}
    </div>
  );
}
