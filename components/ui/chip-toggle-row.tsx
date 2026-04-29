"use client";

import { cn } from "@/lib/utils";

// Shared chip toggle row used by tag presets (ref upload/edit) and the
// planning keyword sections (positive / negative). Each chip toggles its
// own item in/out of the value array. Tone controls the *active* chip
// styling — neutral foreground for tag-style presets, emerald for
// "positive" keywords, rose for "negative" — so callers don't have to
// re-implement the same color combos.

type Tone = "default" | "positive" | "negative";

const ACTIVE_CLASS: Record<Tone, string> = {
  default: "border-foreground bg-foreground text-background",
  positive:
    "border-emerald-300/60 bg-emerald-50/60 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
  negative:
    "border-rose-300/60 bg-rose-50/60 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100",
};

const INACTIVE_CLASS =
  "border-input text-muted-foreground hover:text-foreground";

export function ChipToggleRow({
  label,
  items,
  active,
  onToggle,
  tone = "default",
  disabled,
  textTransform = "lowercase",
}: {
  label?: string;
  items: readonly string[];
  // Items currently active. Match is case-insensitive so manually typed
  // values with different casing still light up the matching chip.
  active: readonly string[];
  onToggle: (item: string) => void;
  tone?: Tone;
  disabled?: boolean;
  // Tags use lowercase; keyword presets sometimes carry case from manual
  // entry. Defaults to lowercase since both current callers want it.
  textTransform?: "lowercase" | "none";
}) {
  const lowerActive = new Set(active.map((a) => a.toLowerCase()));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      ) : null}
      {items.map((item) => {
        const on = lowerActive.has(item.toLowerCase());
        return (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            disabled={disabled}
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider transition-colors",
              textTransform === "lowercase" ? "lowercase" : "",
              on ? ACTIVE_CLASS[tone] : INACTIVE_CLASS,
            )}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
