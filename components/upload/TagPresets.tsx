"use client";

import { parseTags } from "@/lib/slug";
import { cn } from "@/lib/utils";

// Curated starter tags so the textarea isn't a blank prompt. Roughly
// grouped by axis (style → typography → texture → color → mood) but
// rendered as a single flat row — the goal is glanceability, not a
// taxonomy. Order here is the on-screen order.
const TAG_PRESETS = [
  // style
  "swiss",
  "brutalist",
  "minimal",
  "maximal",
  "vintage",
  "modern",
  "lofi",
  // layout / typography
  "grid",
  "asymmetric",
  "serif",
  "sans",
  "mono",
  "display",
  // texture / production
  "riso",
  "letterpress",
  "halftone",
  "noise",
  "3d",
  // color
  "monochrome",
  "duotone",
  "gradient",
  "pastel",
  // mood
  "warm",
  "gritty",
  "playful",
  "elegant",
];

export function TagPresets({
  tagsText,
  onChange,
}: {
  tagsText: string;
  onChange: (next: string) => void;
}) {
  const active = new Set(parseTags(tagsText).map((t) => t.toLowerCase()));

  function toggle(tag: string) {
    const current = parseTags(tagsText);
    const lower = tag.toLowerCase();
    const next = current.some((t) => t.toLowerCase() === lower)
      ? current.filter((t) => t.toLowerCase() !== lower)
      : [...current, tag];
    onChange(next.join(", "));
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        추천
      </span>
      {TAG_PRESETS.map((tag) => {
        const on = active.has(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[10px] lowercase tracking-wider transition-colors",
              on
                ? "border-foreground bg-foreground text-background"
                : "border-input text-muted-foreground hover:text-foreground",
            )}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
