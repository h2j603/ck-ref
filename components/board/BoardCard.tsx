import Image from "next/image";
import Link from "next/link";

import { NicknamePill } from "@/components/nickname-pill";
import type { BoardSummary } from "@/lib/queries";
import { isVideoPath } from "@/lib/media";
import { publicImageUrl } from "@/lib/storage";

export function BoardCard({ board }: { board: BoardSummary }) {
  const cells = [...board.cover_refs];
  while (cells.length < 4) cells.push(null as never);

  return (
    <Link
      href={`/board/${board.id}`}
      className="flex flex-col gap-2 transition-opacity hover:opacity-90"
    >
      <div className="grid aspect-square grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-md bg-muted">
        {cells.map((cell, i) => (
          <div key={i} className="relative overflow-hidden bg-muted">
            {cell ? (
              isVideoPath(cell.image_path) ? (
                <video
                  src={publicImageUrl(cell.image_path)}
                  className="absolute inset-0 h-full w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : (
                <Image
                  src={publicImageUrl(cell.image_path)}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, 200px"
                  className="object-cover"
                />
              )
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-sm font-medium leading-tight">
            {board.title}
          </h3>
          {board.is_private ? (
            <span className="shrink-0 rounded-full border border-input px-1.5 py-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              비공개
            </span>
          ) : null}
        </div>
        <p className="font-mono text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground">
          {board.item_count}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        {board.description ? (
          <p className="truncate text-xs text-muted-foreground">
            {board.description}
          </p>
        ) : (
          <span />
        )}
        <NicknamePill nickname={board.created_by} link={false} />
      </div>
    </Link>
  );
}
