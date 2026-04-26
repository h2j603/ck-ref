import Link from "next/link";

export function WeeklyNudge({ displayName }: { displayName: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-[11px] uppercase tracking-wider">
          weekly · @{displayName}
        </p>
        <p>이번 주 레퍼런스를 아직 안 올렸어요. 한 장 올리고 가요?</p>
      </div>
      <Link
        href="/upload"
        className="rounded-full border border-amber-700/40 bg-amber-700/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-amber-900 transition-colors hover:bg-amber-700/20 dark:border-amber-200/40 dark:text-amber-100"
      >
        업로드하기 →
      </Link>
    </div>
  );
}
