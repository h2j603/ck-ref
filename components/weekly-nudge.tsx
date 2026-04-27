import Link from "next/link";

export function WeeklyNudge({
  displayName,
  message,
}: {
  displayName: string;
  message: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-lime-300/60 bg-lime-50 px-4 py-3 text-sm text-lime-900 dark:border-lime-500/40 dark:bg-lime-500/10 dark:text-lime-100">
      <div className="flex flex-col gap-0.5">
        <p className="font-mono text-[11px] uppercase tracking-wider">
          weekly · @{displayName}
        </p>
        <p>{message}</p>
      </div>
      <Link
        href="/upload"
        className="rounded-full border border-lime-700/40 bg-lime-700/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-lime-900 transition-colors hover:bg-lime-700/20 dark:border-lime-200/40 dark:text-lime-100"
      >
        업로드하기 →
      </Link>
    </div>
  );
}
