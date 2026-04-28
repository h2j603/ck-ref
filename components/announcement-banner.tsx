import { findProfile, type Profile } from "@/lib/profiles";
import type { Announcement } from "@/lib/types";

// Index banner. Stacks active announcements newest-first directly above
// the WeeklyNudge / filter bar so they're impossible to miss when first
// landing on /. Server-rendered: the icon-composer in the header is the
// thing that mutates state.
export function AnnouncementBanner({
  items,
  profiles,
}: {
  items: Announcement[];
  profiles: Profile[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {items.map((a) => {
        const author = findProfile(profiles, a.created_by);
        const authorName = author?.display_name ?? a.created_by;
        return (
          <div
            key={a.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="font-mono text-[11px] uppercase tracking-wider">
                공지 · @{authorName}
              </p>
              <p className="whitespace-pre-wrap break-words">{a.body}</p>
            </div>
            <p className="shrink-0 font-mono text-[10px] uppercase tracking-wider opacity-70">
              ~ {formatExpiry(a.expires_at)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function formatExpiry(iso: string): string {
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(new Date(iso));
}
