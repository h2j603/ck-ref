import Link from "next/link";
import { notFound } from "next/navigation";

import { BoardItemsGrid } from "@/components/board/BoardItemsGrid";
import { BoardOwnerActions } from "@/components/board/BoardOwnerActions";
import { BoardShareButton } from "@/components/board/BoardShareButton";
import { ColumnSelector } from "@/components/gallery/ColumnSelector";
import { NicknamePill } from "@/components/nickname-pill";
import { fetchBoard, fetchBoardRefs } from "@/lib/queries";
import { playlistEmbed } from "@/lib/playlist";

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const board = await fetchBoard(id).catch(() => null);
  if (!board) notFound();

  const refs = await fetchBoardRefs(id).catch(() => []);
  const playlist = playlistEmbed(board.playlist_url);

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
        {board.keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {board.keywords.map((k) => (
              <span
                key={k}
                className="rounded-full border border-input px-2 py-0.5 font-mono text-[10px] lowercase tracking-wider text-muted-foreground"
              >
                {k}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <NicknamePill nickname={board.created_by} />
          <BoardShareButton />
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
      {playlist ? (
        <section className="flex max-w-md flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            playlist
          </p>
          {playlist.src ? (
            <iframe
              src={playlist.src}
              title="board playlist"
              loading="lazy"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              className="w-full rounded-md border border-border/40"
              style={{ height: playlist.height }}
            />
          ) : (
            <a
              href={playlist.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {playlist.href}
            </a>
          )}
        </section>
      ) : null}
    </div>
  );
}
