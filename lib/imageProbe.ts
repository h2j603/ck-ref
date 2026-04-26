"use client";

import { getColor } from "colorthief";

import { colorMetaFromRgb } from "@/lib/color";

export type ProbedImage = {
  width: number;
  height: number;
  colorHex: string | null;
  colorHue: number | null;
};

// Loads the file into an HTMLImageElement to read natural dimensions and run
// the color extractor. Returns null if the browser can't decode it.
export async function probeImage(file: File): Promise<ProbedImage | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      let colorHex: string | null = null;
      let colorHue: number | null = null;
      try {
        const c = await getColor(img);
        if (c) {
          const rgb = c.rgb();
          const meta = colorMetaFromRgb(rgb.r, rgb.g, rgb.b);
          colorHex = meta.hex;
          colorHue = meta.hue;
        }
      } catch {
        /* color extraction is best-effort */
      }
      URL.revokeObjectURL(url);
      resolve({ ...dims, colorHex, colorHue });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
