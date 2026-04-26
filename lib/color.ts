// Hue bucket utilities. We store dominant color as `color_hex` for display
// and `color_hue` (0-359, NULL for low-saturation/greyscale) for cheap range
// queries. Buckets map a hue range to a friendly label and a swatch color.

export const HUE_BUCKETS = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
  "neutral",
] as const;
export type HueBucket = (typeof HUE_BUCKETS)[number];

// [start, end) — `red` wraps around 360 so it gets two ranges.
const RANGES: Record<Exclude<HueBucket, "neutral">, [number, number][]> = {
  red: [
    [345, 360],
    [0, 15],
  ],
  orange: [[15, 45]],
  yellow: [[45, 65]],
  green: [[65, 165]],
  cyan: [[165, 195]],
  blue: [[195, 255]],
  purple: [[255, 285]],
  pink: [[285, 345]],
};

export const BUCKET_SWATCH: Record<HueBucket, string> = {
  red: "#e63946",
  orange: "#f4a261",
  yellow: "#e9c46a",
  green: "#2a9d8f",
  cyan: "#48cae4",
  blue: "#4361ee",
  purple: "#8e44ad",
  pink: "#e879c2",
  neutral: "#a8a29e",
};

export function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

// Greyscale/desaturated colors get NULL hue so they fall into the "neutral"
// bucket without competing for a rainbow slot.
export function colorMetaFromRgb(r: number, g: number, b: number) {
  const { h, s } = rgbToHsv(r, g, b);
  const hex = rgbToHex(r, g, b);
  const hue = s < 0.15 ? null : Math.round(h) % 360;
  return { hex, hue };
}

export function bucketFromHue(hue: number | null): HueBucket {
  if (hue === null) return "neutral";
  for (const [name, ranges] of Object.entries(RANGES) as [
    Exclude<HueBucket, "neutral">,
    [number, number][],
  ][]) {
    for (const [lo, hi] of ranges) {
      if (hue >= lo && hue < hi) return name;
    }
  }
  return "neutral";
}

// Returns ranges to feed Postgres `color_hue >= lo AND color_hue < hi`. The
// caller OR-joins them. `neutral` returns null which the caller should treat
// as `color_hue IS NULL`.
export function bucketHueRanges(
  bucket: HueBucket,
): [number, number][] | null {
  if (bucket === "neutral") return null;
  return RANGES[bucket];
}
