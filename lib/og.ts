import "server-only";

export type OgMeta = {
  image: string | null;
  title: string | null;
  description: string | null;
  siteName: string | null;
};

// Most servers (Instagram included) serve the richest OG meta to Facebook's
// link preview crawler, so we identify as that.
export const OG_USER_AGENT =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_BYTES = 25 * 1024 * 1024;

export function safeUrl(input: string | null | undefined): URL | null {
  if (!input) return null;
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function metaContent(html: string, prop: string): string | null {
  const p = escapeRegex(prop);
  // <meta property="..." content="..."> in either attribute order, single or
  // double quotes.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${p}["'][^>]*\\scontent=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*\\s(?:property|name)=["']${p}["']`,
      "i",
    ),
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1].trim()) : null;
}

function resolveAbsolute(maybe: string | null, baseHref: string): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, baseHref).href;
  } catch {
    return null;
  }
}

// Pinterest serves an og:title that's always the boilerplate "Pinterest에서
// 발견" / "Pin on Pinterest" / "<user> on Pinterest" — the actual content
// title doesn't survive their JS rendering. Detect that and either fall
// back to og:description (often the pin's text), or null to make the
// upload form leave the title blank for the user to type.
function isPinterestHost(host: string): boolean {
  return /(?:^|\.)pinterest\.[a-z.]+$/i.test(host);
}

function looksLikePinterestBoilerplate(title: string): boolean {
  if (/Pinterest/i.test(title)) return true;
  if (/(에서\s*발견|핀\s*on\b)/i.test(title)) return true;
  return false;
}

// Instagram serves a center-cropped square via og:image regardless of the
// post's actual aspect ratio. The public GraphQL endpoint at
// /api/graphql returns the post's display_url at its real proportions
// without needing a login.
export function isInstagramHost(host: string): boolean {
  return /(?:^|\.)instagram\.com$/i.test(host);
}

export function instagramShortcode(href: string): string | null {
  try {
    const u = new URL(href);
    if (!isInstagramHost(u.host)) return null;
    const m = u.pathname.match(/^\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([^/?#]+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

// Instagram's public web app id — the same value the in-browser code
// sends. doc_id is the persisted GraphQL query for "media via shortcode";
// it occasionally rotates but the value below has been stable for the
// scraper community in 2025-2026.
const IG_APP_ID = "936619743392459";
const IG_SHORTCODE_DOC_ID = "10015901848480474";

export async function fetchInstagramDisplayUrl(
  shortcode: string,
): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      variables: JSON.stringify({ shortcode }),
      doc_id: IG_SHORTCODE_DOC_ID,
    });
    const res = await fetch("https://www.instagram.com/api/graphql", {
      method: "POST",
      headers: {
        "User-Agent": OG_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-IG-App-ID": IG_APP_ID,
        "X-FB-LSD": "AVqbxe3J_YA",
        "X-ASBD-ID": "129477",
        Accept: "*/*",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        xdt_shortcode_media?: {
          display_url?: string | null;
          display_resources?: { src?: string | null }[];
        } | null;
      };
    };
    const media = json.data?.xdt_shortcode_media;
    if (!media) return null;
    if (media.display_url) return media.display_url;
    const resources = media.display_resources ?? [];
    // Highest-resolution candidate sits last in display_resources.
    for (let i = resources.length - 1; i >= 0; i -= 1) {
      const src = resources[i]?.src;
      if (src) return src;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseOg(html: string, baseHref: string): OgMeta {
  // Cap the slice we scan so a multi-MB page doesn't blow up regex backtracking.
  const head = html.slice(0, Math.min(html.length, 256 * 1024));

  const image = resolveAbsolute(
    metaContent(head, "og:image") ??
      metaContent(head, "twitter:image") ??
      metaContent(head, "twitter:image:src"),
    baseHref,
  );
  let title =
    metaContent(head, "og:title") ??
    metaContent(head, "twitter:title") ??
    titleTag(head);
  const description =
    metaContent(head, "og:description") ??
    metaContent(head, "twitter:description") ??
    metaContent(head, "description");
  const siteName = metaContent(head, "og:site_name");

  let host: string | null = null;
  try {
    host = new URL(baseHref).host;
  } catch {
    /* baseHref might be malformed — treat as no special handling. */
  }
  if (host && isPinterestHost(host) && title && looksLikePinterestBoilerplate(title)) {
    // Prefer the pin's description if it's substantial; otherwise drop the
    // title so the user picks one themselves.
    if (description && description.trim().length >= 4) {
      title = description.trim();
    } else {
      title = null;
    }
  }

  return { image, title, description, siteName };
}
