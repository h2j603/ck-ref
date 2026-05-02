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
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { RefWithDesigners } from "@/lib/types";

function breakpointsFor(cols: ColumnCount) {
  return { default: cols };
}

export function BoardItemsGrid({
  boardId,
  initialRefs,
}: {
  boardId: string;
  initialRefs: RefWithDesigners[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const { columns } = useColumnPref();
  const { nickname, hydrated } = useNickname();
  const [refs, setRefs] = useState<RefWithDesigners[]>(initialRefs);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Board-only refs don't have a /ref/<id> view worth navigating to
  // (no metadata, no notes, etc.) — clicking them just opens the
  // image full-size in a lightbox.
  const [lightbox, setLightbox] = useState<RefWithDesigners | null>(null);

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
        >
          <button
            type="button"
            onClick={closeLightbox}
            aria-label="close"
            className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="size-4" />
          </button>
          {isVideoPath(lightbox.image_path) ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={publicImageUrl(lightbox.image_path)}
              className="max-h-full max-w-full object-contain"
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
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
