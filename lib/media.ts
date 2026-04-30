// Tiny helpers for video-vs-image branching. We don't keep a media_type
// column on refs; instead we look at the storage path's extension. The
// supported set mirrors what Supabase storage will accept and what most
// browsers can play inline.

const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v"] as const;

export function isVideoPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = path.slice(dot + 1).toLowerCase();
  return (VIDEO_EXTS as readonly string[]).includes(ext);
}

export function isVideoMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith("video/"));
}
