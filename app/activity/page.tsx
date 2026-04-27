import { Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { NicknamePill } from "@/components/nickname-pill";
import { fetchActivity, type ActivityItem } from "@/lib/queries";
import { relativeTime } from "@/lib/relativeTime";
import { publicImageUrl } from "@/lib/storage";

export const metadata = {
  title: "Activity — CK Ref.",
};

export default async function ActivityPage() {
  const items = await fetchActivity(60).catch(() => [] as ActivityItem[]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex items-baseline justify-between pt-2">
        <h1 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Activity — {items.length}
        </h1>
      </header>

      {items.length === 0 ? (
        <p className="py-32 text-center font-mono text-xs text-muted-foreground">
          아직 활동이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((it, i) => (
            <li
              key={`${it.kind}-${i}-${it.at}`}
              className="flex items-start gap-3 border-b border-border/40 py-3 last:border-b-0"
            >
              <Thumbnail item={it} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Headline item={it} />
                {it.bodySnippet ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    “{it.bodySnippet}”
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 self-start font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {relativeTime(it.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumbnail({ item }: { item: ActivityItem }) {
  if (item.ref) {
    return (
      <Link
        href={`/ref/${item.ref.id}`}
        className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-muted"
      >
        <Image
          src={publicImageUrl(item.ref.image_path)}
          alt={item.ref.title ?? "ref"}
          fill
          sizes="48px"
          className="object-cover"
        />
      </Link>
    );
  }
  if (item.board) {
    return (
      <Link
        href={`/board/${item.board.id}`}
        aria-label={item.board.title}
        className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
      >
        BRD
      </Link>
    );
  }
  return <div aria-hidden className="size-12 shrink-0 rounded-sm bg-muted" />;
}

function Headline({ item }: { item: ActivityItem }) {
  const refLink = item.ref ? (
    <Link
      href={`/ref/${item.ref.id}`}
      className="text-foreground underline-offset-2 hover:underline"
    >
      {item.ref.title ?? "untitled"}
    </Link>
  ) : null;
  const boardLink = item.board ? (
    <Link
      href={`/board/${item.board.id}`}
      className="text-foreground underline-offset-2 hover:underline"
    >
      {item.board.title}
    </Link>
  ) : null;

  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <NicknamePill nickname={item.actor} />
      {item.kind === "ref" ? (
        <>
          <span>업로드 —</span>
          {refLink}
        </>
      ) : null}
      {item.kind === "note" ? (
        <>
          <span>노트 —</span>
          {refLink}
        </>
      ) : null}
      {item.kind === "reply" ? (
        <>
          <span>답글 —</span>
          {refLink}
        </>
      ) : null}
      {item.kind === "rating" ? (
        <>
          <span className="inline-flex items-center gap-0.5">
            <Star className="size-3 fill-lime-500 stroke-none" />
            <span className="tabular-nums text-foreground">{item.stars}</span>
          </span>
          <span>—</span>
          {refLink}
        </>
      ) : null}
      {item.kind === "annotation" ? (
        <>
          <span>주석 —</span>
          {refLink}
        </>
      ) : null}
      {item.kind === "board" ? (
        <>
          <span>새 보드 —</span>
          {boardLink}
        </>
      ) : null}
    </p>
  );
}
