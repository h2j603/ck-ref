import { Star } from "lucide-react";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NicknamePill } from "@/components/nickname-pill";
import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import { isProfileKey } from "@/lib/profiles";
import { fetchActivityForMe, type ActivityItem } from "@/lib/queries";
import { relativeTime } from "@/lib/relativeTime";
import { publicImageUrl } from "@/lib/storage";

export const metadata = {
  title: "Activity — CK Ref.",
};

export default async function ActivityPage() {
  const store = await cookies();
  const me = store.get(ARCHIVE_AUTH_COOKIE)?.value ?? null;
  if (!me || !isProfileKey(me)) redirect("/gate?from=/activity");

  const items = await fetchActivityForMe(me, 60).catch(
    () => [] as ActivityItem[],
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          내 활동 — {items.length}
        </p>
        <h1 className="text-sm text-muted-foreground">
          내 ref에 달린 노트·주석·별점, 그리고 내 노트에 달린 답글만 모아 봅니다.
        </h1>
      </header>

      {items.length === 0 ? (
        <p className="py-32 text-center font-mono text-xs text-muted-foreground">
          아직 받은 활동이 없습니다.
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

function targetHref(item: ActivityItem): string {
  const base = `/ref/${item.ref.id}`;
  if (item.annotationId) return `${base}#ann-${item.annotationId}`;
  if (item.noteId) return `${base}#note-${item.noteId}`;
  return base;
}

function Thumbnail({ item }: { item: ActivityItem }) {
  return (
    <Link
      href={targetHref(item)}
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

function Headline({ item }: { item: ActivityItem }) {
  const refLink = (
    <Link
      href={targetHref(item)}
      className="text-foreground underline-offset-2 hover:underline"
    >
      {item.ref.title ?? "untitled"}
    </Link>
  );

  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <NicknamePill nickname={item.actor} />
      {item.kind === "note" ? (
        <>
          <span>내 ref에 노트 —</span>
          {refLink}
        </>
      ) : null}
      {item.kind === "reply" ? (
        <>
          <span>
            {item.reason === "reply_to_me" ? "내 노트에 답글" : "내 ref에 답글"} —
          </span>
          {refLink}
        </>
      ) : null}
      {item.kind === "annotation" ? (
        <>
          <span>내 ref에 주석 —</span>
          {refLink}
        </>
      ) : null}
      {item.kind === "rating" ? (
        <>
          <span className="inline-flex items-center gap-0.5">
            <Star className="size-3 fill-lime-500 stroke-none" />
            <span className="tabular-nums text-foreground">{item.stars}</span>
          </span>
          <span>— 내 ref</span>
          {refLink}
        </>
      ) : null}
    </p>
  );
}
