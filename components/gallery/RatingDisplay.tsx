import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export function RatingDisplay({
  avg,
  count,
  className,
}: {
  avg: number | null;
  count: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider tabular-nums text-muted-foreground",
        className,
      )}
    >
      <Star
        className={cn(
          "size-3 shrink-0",
          avg !== null
            ? "fill-lime-500 stroke-none"
            : "stroke-muted-foreground/40",
        )}
      />
      {avg !== null ? (
        <>
          <span className="text-foreground">{avg.toFixed(1)}</span>
          <span>· {count}</span>
        </>
      ) : (
        <span>—</span>
      )}
    </div>
  );
}
