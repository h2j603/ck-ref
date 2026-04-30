"use client";

import { getColor } from "colorthief";

import { colorMetaFromRgb } from "@/lib/color";
import { isVideoMime } from "@/lib/media";

export type ProbedImage = {
  width: number;
  height: number;
  colorHex: string | null;
  colorHue: number | null;
};

// Loads the file into an HTMLImageElement (or HTMLVideoElement for video
// files) to read natural dimensions and run the color extractor. Returns
// null if the browser can't decode it. For video, color extraction is
// skipped — drawing a representative frame onto a canvas is fragile and
// dominant colour rarely conveys the moving content anyway.
export async function probeImage(file: File): Promise<ProbedImage | null> {
  if (isVideoMime(file.type)) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;
      v.onloadedmetadata = () => {
        const dims = { width: v.videoWidth, height: v.videoHeight };
        URL.revokeObjectURL(url);
        if (!dims.width || !dims.height) {
          resolve(null);
        } else {
          resolve({ ...dims, colorHex: null, colorHue: null });
        }
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      v.src = url;
    });
  }

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
