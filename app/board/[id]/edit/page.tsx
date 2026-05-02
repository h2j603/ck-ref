import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchBoard } from "@/lib/queries";

import { EditBoardForm } from "./EditBoardForm";

export const metadata = { title: "Edit board — KIWI Juice" };

export default async function EditBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const board = await fetchBoard(id).catch(() => null);
  if (!board) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-2">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / board / edit
        </p>
        <h1 className="text-2xl font-medium tracking-tight">보드 수정</h1>
        <Link
          href={`/board/${board.id}`}
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          ← back to board
        </Link>
      </header>
      <EditBoardForm
        boardId={board.id}
        createdBy={board.created_by}
        initial={{
          title: board.title,
          description: board.description,
          keywords: board.keywords,
          playlist_url: board.playlist_url,
        }}
      />
    </div>
  );
}
