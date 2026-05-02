"use client";

import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Masonry from "react-masonry-css";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AddRefsToBoardDialog } from "@/components/board/AddRefsToBoardDialog";
import { BoardImageUploadButton } from "@/components/board/BoardImageUploadButton";
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

// Border tint per fit level. The card always carries border-2 so layout
// stays consistent; only the colour shifts.
const FIT_BORDER: Record<number, string> = {
  0: "border-transparent",
  1: "border-rose-400/70 dark:border-rose-500/60",
  2: "border-orange-400/70 dark:border-orange-500/60",
  3: "border-amber-400/70 dark:border-amber-500/60",
  4: "border-lime-500/70 dark:border-lime-500/60",
  5: "border-emerald-500/80 dark:border-emerald-500/70",
};

const FIT_DOT_FILL: Record<number, string> = {
  1: "bg-rose-400",
  2: "bg-orange-400",
  3: "bg-amber-400",
  4: "bg-lime-500",
  5: "bg-emerald-500",
};

const FIT_LABEL: Record<number, string> = {
  0: "—",
  1: "거의 안 맞음",
  2: "조금 맞음",
  3: "보통",
  4: "잘 맞음",
  5: "딱 맞음",
};

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
              className={cn(
                "group relative block overflow-hidden rounded-md border-2 bg-muted transition-colors",
                FIT_BORDER[ref.fit] ?? FIT_BORDER[0],
              )}
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
              <FitDots
                fit={ref.fit}
                editable={Boolean(hydrated && nickname)}
                onSet={(n) => void setFit(ref.id, n)}
              />
              {hydrated && nickname ? (
                <button
                  type="button"
                  onClick={() => remove(ref.id)}
                  disabled={removing !== null}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-background hover:text-destructive hover:opacity-100 disabled:opacity-40"
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

// 5-dot fit selector pinned to the bottom-left of each card. Tapping
// dot N sets fit to N (1-5); tapping the currently-selected dot clears
// to 0. Read-only when the viewer has no nickname.
function FitDots({
  fit,
  editable,
  onSet,
}: {
  fit: number;
  editable: boolean;
  onSet: (next: number) => void;
}) {
  return (
    <div
      className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-full bg-background/90 px-1.5 py-1 shadow-sm"
      // Stop the click from reaching the underlying Link / lightbox
      // button — the dots are an in-card control, not a card click.
      onClick={(e) => e.stopPropagation()}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= fit;
        return (
          <button
            key={n}
            type="button"
            disabled={!editable}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSet(fit === n ? 0 : n);
            }}
            aria-label={`fit ${n}/5 — ${FIT_LABEL[n]}`}
            title={`${n}/5 · ${FIT_LABEL[n]}`}
            className={cn(
              "block size-2 rounded-full transition-colors",
              filled
                ? FIT_DOT_FILL[n]
                : "bg-muted-foreground/25 hover:bg-muted-foreground/40",
              editable ? "cursor-pointer" : "cursor-default",
            )}
          />
        );
      })}
    </div>
  );
}
