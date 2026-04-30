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
// post's actual aspect ratio. We try several public paths to recover
// the original-aspect image URL — see fetchInstagramOriginalImage.
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

// A normal browser User-Agent — Instagram serves a richer page (with the
// post JSON inline) to browser UAs than to crawler UAs. Updated to a
// recent Safari mobile string which their anti-bot tolerates well.
const IG_BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const IG_APP_ID = "936619743392459";
const IG_SHORTCODE_DOC_ID = "10015901848480474";

// Pull the post's JSON `display_url` straight out of the page HTML. The
// browser-UA fetch below returns the React tree where "display_url"
// appears inline as a JSON-escaped string. Cheap, no extra round-trip
// when we already have the HTML.
function extractDisplayUrlFromHtml(html: string): string | null {
  const re = /"display_url":\s*"((?:[^"\\]|\\.)*)"/;
  const m = html.match(re);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return null;
  }
}

async function fetchInstagramHtmlAsBrowser(
  href: string,
): Promise<string | null> {
  try {
    const res = await fetch(href, {
      headers: {
        "User-Agent": IG_BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchInstagramGraphQL(
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
        "User-Agent": IG_BROWSER_UA,
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
    for (let i = resources.length - 1; i >= 0; i -= 1) {
      const src = resources[i]?.src;
      if (src) return src;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchMicrolinkImage(href: string): Promise<string | null> {
  try {
    // Microlink's free tier (no key) returns proper Instagram media
    // with the original aspect ratio. Capped at 50 req/day per IP — fine
    // as a last-resort fallback.
    const url = `https://api.microlink.io/?url=${encodeURIComponent(href)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { image?: { url?: string | null } | null };
    };
    return json.data?.image?.url ?? null;
  } catch {
    return null;
  }
}

// Layered fallback chain. Order chosen so we lean on the cheapest /
// most reliable path first and only escalate when each fails.
//
//   1. Re-fetch the post page with a browser UA and grep "display_url"
//      out of the inline JSON. Same kind of request the og fetch
//      already does, just with a different UA — no extra service.
//   2. Hit Instagram's public web-app GraphQL for display_url.
//   3. As a last resort, ask Microlink (free tier, ~50/day per IP).
//
// First non-null wins. The og:image (cropped square) we already had
// stays as the implicit final fallback if everything fails.
export async function fetchInstagramOriginalImage(
  href: string,
  shortcode: string,
): Promise<string | null> {
  const html = await fetchInstagramHtmlAsBrowser(href);
  if (html) {
    const fromHtml = extractDisplayUrlFromHtml(html);
    if (fromHtml) return fromHtml;
  }
  const fromGraph = await fetchInstagramGraphQL(shortcode);
  if (fromGraph) return fromGraph;
  return await fetchMicrolinkImage(href);
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
