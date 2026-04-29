import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABELS: Record<ProjectStatus, string> = {
  planning: "planning",
  in_progress: "in progress",
  done: "done",
};

const TONES: Record<ProjectStatus, string> = {
  planning: "border-indigo-300/60 bg-indigo-50 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-100",
  in_progress: "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
  done: "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        TONES[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}
