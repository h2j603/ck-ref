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
          내 ref·작업·업데이트에 달린 코멘트와 내 노트에 달린 답글만 모입니다.
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
  if (item.refTarget) {
    const base = `/ref/${item.refTarget.id}`;
    if (item.annotationId) return `${base}#ann-${item.annotationId}`;
    if (item.noteId) return `${base}#note-${item.noteId}`;
    return base;
  }
  if (item.projectTarget) {
    const base = `/wip/${item.projectTarget.id}`;
    if (item.noteId) return `${base}#note-${item.noteId}`;
    return base;
  }
  if (item.updateTarget) {
    const base = `/wip/${item.updateTarget.projectId}`;
    if (item.noteId) return `${base}#note-${item.noteId}`;
    return base;
  }
  return "/activity";
}

function targetTitle(item: ActivityItem): string {
  if (item.refTarget) return item.refTarget.title ?? "untitled";
  if (item.projectTarget) return item.projectTarget.title;
  if (item.updateTarget) return item.updateTarget.projectTitle;
  return "untitled";
}

function Thumbnail({ item }: { item: ActivityItem }) {
  const href = targetHref(item);
  if (item.refTarget) {
    return (
      <Link
        href={href}
        className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-muted"
      >
        <Image
          src={publicImageUrl(item.refTarget.image_path)}
          alt={item.refTarget.title ?? "ref"}
          fill
          sizes="48px"
          className="object-cover"
        />
      </Link>
    );
  }
  if (item.updateTarget) {
    return (
      <Link
        href={href}
        className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-muted"
      >
        <Image
          src={publicImageUrl(item.updateTarget.image_path)}
          alt={item.updateTarget.projectTitle}
          fill
          sizes="48px"
          className="object-cover"
        />
      </Link>
    );
  }
  if (item.projectTarget) {
    return (
      <Link
        href={href}
        aria-label={item.projectTarget.title}
        className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
      >
        WIP
      </Link>
    );
  }
  return <div aria-hidden className="size-12 shrink-0 rounded-sm bg-muted" />;
}

function Headline({ item }: { item: ActivityItem }) {
  const link = (
    <Link
      href={targetHref(item)}
      className="text-foreground underline-offset-2 hover:underline"
    >
      {targetTitle(item)}
    </Link>
  );

  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      <NicknamePill nickname={item.actor} />
      {item.kind === "rating" ? (
        <>
          <span className="inline-flex items-center gap-0.5">
            <Star className="size-3 fill-lime-500 stroke-none" />
            <span className="tabular-nums text-foreground">{item.stars}</span>
          </span>
          <span>— 내 ref</span>
          {link}
        </>
      ) : item.kind === "annotation" ? (
        <>
          <span>내 ref에 주석 —</span>
          {link}
        </>
      ) : (
        <>
          <span>{verbFor(item)} —</span>
          {link}
        </>
      )}
    </p>
  );
}

function verbFor(item: ActivityItem): string {
  // note vs reply × where the target lives × whether it's because of my own note
  const isReply = item.kind === "reply";
  if (item.reason === "reply_to_me") {
    return isReply ? "내 노트에 답글" : "내 노트에 노트";
  }
  if (item.refTarget) return isReply ? "내 ref에 답글" : "내 ref에 노트";
  if (item.projectTarget) return isReply ? "내 작업에 답글" : "내 작업에 노트";
  if (item.updateTarget) return isReply ? "내 업데이트에 답글" : "내 업데이트에 노트";
  return isReply ? "답글" : "노트";
}
