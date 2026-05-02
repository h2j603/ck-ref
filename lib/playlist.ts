// Recognise common music-platform URLs and derive an embed URL we can
// drop into an <iframe>. Returns null when the input isn't a usable URL
// at all; when we recognise the host but can't embed (e.g. an artist
// page rather than a playlist), we return kind: "other" with no src so
// the caller can fall back to a plain link.

export type PlaylistEmbed = {
  kind: "spotify" | "apple" | "youtube" | "soundcloud" | "other";
  src: string | null;
  href: string;
  // What height to give the <iframe> so the platform renders cleanly
  // at its intended layout. Most platforms shrink to fit; Apple Music
  // ignores iframe height and always draws the full ~450px card.
  iframeHeight: number;
  // Visible clamp on the wrapper. Equals iframeHeight when the
  // platform respects the iframe size; smaller when we crop a card
  // we couldn't shrink (Apple Music — hides its big "재생" / "앱에서
  // 보기" footer buttons).
  containerHeight: number;
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

  // Spotify — open.spotify.com/<kind>/<id>. The platform respects
  // iframe height: 152 → compact playlist row, 80 → single-line track.
  if (host === "open.spotify.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && SPOTIFY_KINDS.has(parts[0])) {
      const h = parts[0] === "track" ? 80 : 152;
      return {
        kind: "spotify",
        src: `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`,
        href: trimmed,
        iframeHeight: h,
        containerHeight: h,
      };
    }
  }

  // Apple Music — music.apple.com → embed.music.apple.com with same
  // path. Apple's playlist embed renders at a fixed ~450px regardless
  // of the iframe height we pass, so we let it draw at its natural
  // size and crop the wrapper down to a header strip — that hides the
  // big bottom "재생" / "앱에서 보기" buttons while keeping the cover
  // art and the first couple of track titles visible.
  if (host === "music.apple.com") {
    return {
      kind: "apple",
      src: `https://embed.music.apple.com${u.pathname}${u.search}`,
      href: trimmed,
      iframeHeight: 450,
      containerHeight: 175,
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
          iframeHeight: 240,
          containerHeight: 240,
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
          iframeHeight: 240,
          containerHeight: 240,
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
        iframeHeight: 240,
        containerHeight: 240,
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
      iframeHeight: 120,
      containerHeight: 120,
    };
  }

  return {
    kind: "other",
    src: null,
    href: trimmed,
    iframeHeight: 0,
    containerHeight: 0,
  };
}
