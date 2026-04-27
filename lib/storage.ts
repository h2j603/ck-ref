import { STORAGE_BUCKET } from "./supabase/env";

export function publicImageUrl(imagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !imagePath) return imagePath;
  // Supabase public storage URL pattern.
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${STORAGE_BUCKET}/${imagePath.replace(/^\/+/, "")}`;
}

// Server-side render endpoint that resizes on the fly. Used to feed
// embedding providers a small image rather than a multi-megapixel one —
// CLIP-class models bin to ~224-512px internally anyway, so anything
// larger is wasted bandwidth and wasted provider tokens. Falls back to
// the plain public URL if the env var isn't set.
export function transformedImageUrl(
  imagePath: string,
  opts: { width?: number; height?: number; resize?: "cover" | "contain" } = {},
): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !imagePath) return imagePath;
  const cleanBase = base.replace(/\/$/, "");
  const cleanPath = imagePath.replace(/^\/+/, "");
  const params = new URLSearchParams();
  if (opts.width) params.set("width", String(opts.width));
  if (opts.height) params.set("height", String(opts.height));
  if (opts.resize) params.set("resize", opts.resize);
  const qs = params.toString();
  return `${cleanBase}/storage/v1/render/image/public/${STORAGE_BUCKET}/${cleanPath}${qs ? `?${qs}` : ""}`;
}
