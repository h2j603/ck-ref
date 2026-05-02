// Recognise common music-platform URLs and derive an embed URL we can
// drop into an <iframe>. Returns null when the input isn't a usable URL
// at all; when we recognise the host but can't embed (e.g. an artist
// page rather than a playlist), we return kind: "other" with no src so
// the caller can fall back to a plain link.

export type PlaylistEmbed = {
  kind: "spotify" | "apple" | "youtube" | "soundcloud" | "other";
  src: string | null;
  href: string;
  height: number;
};

const SPOTIFY_KINDS = new Set([
  "playlist",
  "album",
  "track",
  "artist",
  "show",
  "episode",
]);

export function playlistEmbed(raw: string | null | undefined): PlaylistEmbed | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();

  // Spotify — open.spotify.com/<kind>/<id>
  if (host === "open.spotify.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && SPOTIFY_KINDS.has(parts[0])) {
      return {
        kind: "spotify",
        src: `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`,
        href: trimmed,
        // Spotify's recommended sizes: 80 for compact, 352 for full.
        // Full-card reads better in a moodboard.
        height: parts[0] === "track" ? 152 : 352,
      };
    }
  }

  // Apple Music — music.apple.com → embed.music.apple.com with same path.
  if (host === "music.apple.com") {
    return {
      kind: "apple",
      src: `https://embed.music.apple.com${u.pathname}${u.search}`,
      href: trimmed,
      height: 450,
    };
  }

  // YouTube playlist / single video / youtu.be short link.
  if (host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com") {
    if (u.pathname === "/playlist") {
      const list = u.searchParams.get("list");
      if (list) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/videoseries?list=${list}`,
          href: trimmed,
          height: 380,
        };
      }
    }
    if (u.pathname === "/watch") {
      const v = u.searchParams.get("v");
      if (v) {
        return {
          kind: "youtube",
          src: `https://www.youtube.com/embed/${v}`,
          href: trimmed,
          height: 380,
        };
      }
    }
  }
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\//, "").split("/")[0];
    if (id) {
      return {
        kind: "youtube",
        src: `https://www.youtube.com/embed/${id}`,
        href: trimmed,
        height: 380,
      };
    }
  }

  // SoundCloud — needs the /player/ wrapper around the original URL.
  if (host === "soundcloud.com" || host === "www.soundcloud.com") {
    return {
      kind: "soundcloud",
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(
        trimmed,
      )}&color=%23000000&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`,
      href: trimmed,
      height: 166,
    };
  }

  return { kind: "other", src: null, href: trimmed, height: 0 };
}
