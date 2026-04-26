"use client";

import { COLUMN_OPTIONS, useColumnPref } from "@/lib/columnPref";
import { cn } from "@/lib/utils";

export function ColumnSelector() {
  const { columns, setColumns } = useColumnPref();

  return (
    <div
      className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
      aria-label="columns"
    >
      <span className="hidden sm:inline">Cols</span>
      <div className="flex items-center gap-px">
        {COLUMN_OPTIONS.map((n) => {
          const active = columns === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setColumns(n)}
              aria-pressed={active}
              aria-label={`${n} column${n === 1 ? "" : "s"}`}
              className={cn(
                "h-6 w-6 rounded-md border text-[11px] transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-input hover:border-foreground/60 hover:text-foreground",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
