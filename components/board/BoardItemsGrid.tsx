"use client";

import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Masonry from "react-masonry-css";
import { useState } from "react";

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
  const { columns } = useColumnPref();
  const { nickname, hydrated } = useNickname();
  const [refs, setRefs] = useState<RefWithDesigners[]>(initialRefs);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (refs.length === 0) {
    return (
      <p className="py-32 text-center font-mono text-xs text-muted-foreground">
        아직 보드에 ref가 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Masonry
        breakpointCols={breakpointsFor(columns)}
        className="masonry-grid"
        columnClassName="masonry-grid_column"
      >
        {refs.map((ref) => {
          const w = ref.image_width ?? 4;
          const h = ref.image_height ?? 5;
          return (
            <div
              key={ref.id}
              className="group relative block overflow-hidden bg-muted"
            >
              <Link href={`/ref/${ref.id}`} className="block">
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
              </Link>
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
    </div>
  );
}
