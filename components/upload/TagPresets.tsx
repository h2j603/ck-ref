"use client";

import { ChipToggleRow } from "@/components/ui/chip-toggle-row";
import { parseTags } from "@/lib/slug";

// Curated starter tags so the textarea isn't a blank prompt. Roughly
// grouped by axis (style → typography → texture → color → mood) but
// rendered as a single flat row — the goal is glanceability, not a
// taxonomy. Order here is the on-screen order. Exported so the WIP
// planning keyword sections can reuse the same vocabulary.
export const TAG_PRESETS = [
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
  const active = parseTags(tagsText);

  function toggle(tag: string) {
    const lower = tag.toLowerCase();
    const next = active.some((t) => t.toLowerCase() === lower)
      ? active.filter((t) => t.toLowerCase() !== lower)
      : [...active, tag];
    onChange(next.join(", "));
  }

  return (
    <ChipToggleRow
      label="추천"
      items={TAG_PRESETS}
      active={active}
      onToggle={toggle}
    />
  );
}
