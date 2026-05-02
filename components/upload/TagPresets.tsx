"use client";

import { ChipToggleRow } from "@/components/ui/chip-toggle-row";
import { parseTags } from "@/lib/slug";

// Curated starter tags so the textarea isn't a blank prompt. Roughly
// grouped by axis (style → typography → texture → color → mood) but
// rendered as a single flat row — the goal is glanceability, not a
// taxonomy. Order here is the on-screen order. Exported so the WIP
// planning keyword sections (positive / negative) can reuse the same
// vocabulary; words that read naturally as either a "want" or a
// "want-to-avoid" should land here.
export const TAG_PRESETS = [
  // style / movement
  "swiss",
  "brutalist",
  "minimal",
  "maximal",
  "vintage",
  "modern",
  "lofi",
  "y2k",
  "retro",
  "futurist",
  "postmodern",
  "deconstructed",
  "art-deco",
  "pop",
  "organic",
  "geometric",
  "conceptual",
  "editorial",
  "surreal",
  // layout / typography
  "grid",
  "asymmetric",
  "serif",
  "sans",
  "mono",
  "display",
  "condensed",
  "expanded",
  "italic",
  "variable",
  "slab",
  "script",
  "hangul",
  "latin",
  // texture / production
  "riso",
  "letterpress",
  "halftone",
  "noise",
  "3d",
  "screen-print",
  "foil",
  "deboss",
  "glitch",
  "pixel",
  "hand-drawn",
  "photocopy",
  "collage",
  "ai-generated",
  "photographic",
  // color
  "monochrome",
  "duotone",
  "gradient",
  "pastel",
  "high-contrast",
  "muted",
  "neon",
  "earthtone",
  "fluorescent",
  "achromatic",
  "jewel-tone",
  // mood
  "warm",
  "gritty",
  "playful",
  "elegant",
  "serious",
  "soft",
  "edgy",
  "bold",
  "refined",
  "raw",
  "intimate",
  "mysterious",
  "energetic",
  "calm",
  "nostalgic",
  "dreamy",
  "clinical",
  "cozy",
  "witty",
  "dark",
  "bright",
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
