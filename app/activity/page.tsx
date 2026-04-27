import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NicknamePill } from "@/components/nickname-pill";
import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import { isProfileKey } from "@/lib/profiles";
import { fetchNotificationsFor } from "@/lib/queries";
import { relativeTime } from "@/lib/relativeTime";
import type { NotificationKind } from "@/lib/types";

export const metadata = {
  title: "Activity — CK Ref.",
};

const KIND_LABEL: Record<NotificationKind, string> = {
  note: "노트",
  reply: "답글",
  annotation: "주석",
  rating: "별점",
  ref_upload: "새 ref",
  project_update: "업데이트",
  ref_link: "ref 연결",
  update_ref_link: "ref 첨부",
  event_create: "새 일정",
};

const PAGE_SIZE = 60;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const store = await cookies();
  const me = store.get(ARCHIVE_AUTH_COOKIE)?.value ?? null;
  if (!me || !isProfileKey(me)) redirect("/gate?from=/activity");

  const { before } = await searchParams;
  const items = await fetchNotificationsFor(me, {
    limit: PAGE_SIZE + 1,
    before,
  }).catch(() => []);
  const hasMore = items.length > PAGE_SIZE;
  const visible = hasMore ? items.slice(0, PAGE_SIZE) : items;
  const nextCursor = hasMore ? visible[visible.length - 1]?.created_at : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          내 알림
        </p>
        <h1 className="text-sm text-muted-foreground">
          내가 받은 모든 알림. 헤더의 🔔 드롭다운과 같은 데이터지만 끝까지
          스크롤할 수 있어요.
        </h1>
      </header>

      {visible.length === 0 ? (
        <p className="py-32 text-center font-mono text-xs text-muted-foreground">
          아직 받은 알림이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col">
          {visible.map((n) => (
            <li
              key={n.id}
              className="border-b border-border/40 last:border-b-0"
            >
              <Link
                href={n.link}
                className={`flex items-start gap-3 py-3 transition-colors hover:bg-muted/40 ${
                  n.read_at ? "" : "bg-muted/20"
                }`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1 px-2">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <NicknamePill nickname={n.actor} />
                    <span>·</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider">
                      {KIND_LABEL[n.kind] ?? n.kind}
                    </span>
                  </p>
                  {n.body ? (
                    <p className="line-clamp-2 text-xs text-foreground/80">
                      {n.body}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 self-start pr-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {relativeTime(n.created_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div className="flex justify-center pb-4">
          <Link
            href={`/activity?before=${encodeURIComponent(nextCursor)}`}
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            더 보기 ↓
          </Link>
        </div>
      ) : null}
    </div>
  );
}
