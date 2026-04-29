import Link from "next/link";
import { notFound } from "next/navigation";

import { BoardItemsGrid } from "@/components/board/BoardItemsGrid";
import { BoardOwnerActions } from "@/components/board/BoardOwnerActions";
import { ColumnSelector } from "@/components/gallery/ColumnSelector";
import { NicknamePill } from "@/components/nickname-pill";
import { fetchBoard, fetchBoardRefs } from "@/lib/queries";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const board = await fetchBoard(id).catch(() => null);
  if (!board) notFound();

  const refs = await fetchBoardRefs(id).catch(() => []);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-8">
      <header className="flex flex-col gap-3 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / board
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-medium tracking-tight">{board.title}</h1>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {refs.length} ref{refs.length === 1 ? "" : "s"}
          </p>
        </div>
        {board.description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-foreground">
            {board.description}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <NicknamePill nickname={board.created_by} />
          <BoardOwnerActions
            boardId={board.id}
            createdBy={board.created_by}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/board"
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← all boards
          </Link>
          <ColumnSelector />
        </div>
      </header>
      <BoardItemsGrid boardId={board.id} initialRefs={refs} />
    </div>
  );
}
