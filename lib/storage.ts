import { STORAGE_BUCKET } from "./supabase/env";

export function publicImageUrl(imagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !imagePath) return imagePath;
  // Supabase public storage URL pattern.
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${STORAGE_BUCKET}/${imagePath.replace(/^\/+/, "")}`;
}
