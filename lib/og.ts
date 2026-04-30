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

// Walk a freshly-served Set-Cookie header for the csrftoken — Instagram
// sets it on the first GET, and the GraphQL POST below 4xx's without
// it. Fetching the homepage (small payload) is cheaper than the post
// page and gets us a token reliably.
async function fetchInstagramCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch("https://www.instagram.com/", {
      headers: {
        "User-Agent": IG_BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const setCookie =
      res.headers.get("set-cookie") ??
      // some runtimes lower-case Set-Cookie, others split it
      res.headers.get("Set-Cookie") ??
      "";
    const m = setCookie.match(/csrftoken=([^;,\s]+)/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

// Instagram returns image URLs in two shapes inside the inline JSON of
// a public post page:
//   1. "display_url":"https://...scontent..."
//   2. "image_versions2":{"candidates":[{"url":"https://...","width":...}]}
// `display_url` covers the carousel cover but is sometimes the only
// entry served to logged-out viewers. The image_versions2 candidates
// list gives us the highest-resolution variants per slide, including
// non-square ratios. Walk both paths and dedupe.
function extractDisplayUrlsFromHtml(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  function push(raw: string) {
    try {
      const url = JSON.parse(`"${raw}"`) as string;
      if (typeof url !== "string") return;
      if (seen.has(url)) return;
      seen.add(url);
      out.push(url);
    } catch {
      /* skip malformed */
    }
  }
  const displayRe = /"display_url":\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = displayRe.exec(html)) !== null) push(m[1]);
  // image_versions2.candidates[].url — first (highest-res) candidate
  // wins per slide. Pattern is loose because the JSON is minified
  // without consistent whitespace.
  const candidatesRe =
    /"image_versions2":\s*\{[^}]*?"candidates":\s*\[\s*\{[^}]*?"url":\s*"((?:[^"\\]|\\.)*)"/g;
  while ((m = candidatesRe.exec(html)) !== null) push(m[1]);
  return out;
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

// Each carousel slide we surface to the upload form. For video slides
// `url` is the actual mp4 (preferred when available) so the upload
// form can store the moving frames; `poster` carries the still image
// for cards / grid thumbnails. Image slides leave is_video false and
// poster undefined.
export type InstagramSlide = {
  url: string;
  is_video?: boolean;
  poster?: string;
};

async function fetchInstagramGraphQL(
  shortcode: string,
): Promise<InstagramSlide[]> {
  try {
    // GraphQL POST without a csrftoken returns 401 from Vercel egress
    // IPs in 2026. Fetch one cheaply first.
    const csrf = await fetchInstagramCsrfToken();
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
        ...(csrf
          ? {
              "X-CSRFToken": csrf,
              Cookie: `csrftoken=${csrf}`,
            }
          : {}),
        Accept: "*/*",
        Referer: "https://www.instagram.com/",
        Origin: "https://www.instagram.com",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    type Node = {
      __typename?: string;
      is_video?: boolean | null;
      video_url?: string | null;
      display_url?: string | null;
      display_resources?: { src?: string | null }[];
    };
    const json = (await res.json()) as {
      data?: {
        xdt_shortcode_media?:
          | (Node & {
              edge_sidecar_to_children?: {
                edges?: { node?: Node }[];
              };
            })
          | null;
      };
    };
    const media = json.data?.xdt_shortcode_media;
    if (!media) return [];

    function pickPoster(node: Node | undefined | null): string | null {
      if (!node) return null;
      if (node.display_url) return node.display_url;
      const resources = node.display_resources ?? [];
      for (let i = resources.length - 1; i >= 0; i -= 1) {
        const src = resources[i]?.src;
        if (src) return src;
      }
      return null;
    }
    function isVideo(node: Node | undefined | null): boolean {
      return Boolean(node?.is_video) || node?.__typename === "GraphVideo";
    }
    function toSlide(node: Node | undefined | null): InstagramSlide | null {
      if (!node) return null;
      const poster = pickPoster(node);
      if (isVideo(node)) {
        const url = node.video_url ?? poster;
        if (!url) return null;
        return {
          url,
          is_video: true,
          ...(node.video_url && poster ? { poster } : {}),
        };
      }
      return poster ? { url: poster } : null;
    }

    const children = media.edge_sidecar_to_children?.edges ?? [];
    if (children.length > 0) {
      return children
        .map((edge) => toSlide(edge.node))
        .filter((s): s is InstagramSlide => s !== null);
    }

    const single = toSlide(media);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

// Iframely returns structured media for Instagram posts including every
// carousel slide at original aspect. Free tier is 10K/mo with an API
// key set as IFRAMELY_KEY in env. Returns [] silently when the key is
// absent or the call fails so the chain falls back gracefully.
async function fetchInstagramIframely(
  href: string,
): Promise<InstagramSlide[]> {
  const key = process.env.IFRAMELY_KEY;
  if (!key) return [];
  try {
    const url = `https://iframe.ly/api/iframely?url=${encodeURIComponent(href)}&api_key=${encodeURIComponent(key)}&omit_css=1&omit_script=1`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    type Link = {
      href?: string;
      type?: string;
      rel?: string[];
      media?: { width?: number; height?: number } | null;
    };
    const json = (await res.json()) as { links?: Link[] };
    const links = json.links ?? [];

    // Iframely tags carousel slides with rel containing "image" (or
    // "thumbnail" for the cover). Player rel marks the embeddable
    // video. Walk in order, dedupe by href, prefer non-square media.
    const slides: InstagramSlide[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      const h = link.href;
      if (!h || seen.has(h)) continue;
      const rels = link.rel ?? [];
      const type = link.type ?? "";
      if (type.startsWith("video/")) {
        seen.add(h);
        slides.push({ url: h, is_video: true });
      } else if (
        type.startsWith("image/") &&
        (rels.includes("image") || rels.includes("thumbnail"))
      ) {
        seen.add(h);
        slides.push({ url: h });
      }
    }
    return slides;
  } catch {
    return [];
  }
}

async function fetchMicrolinkImage(href: string): Promise<string | null> {
  try {
    // Microlink's free tier (no key) returns proper Instagram media
    // with the original aspect ratio — single image only, no carousel
    // support. Used as a last-resort cover fallback.
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

const MAX_INSTAGRAM_SLIDES = 20;

// Layered fallback returning every slide, with video flag preserved.
//
//   1. Iframely — when IFRAMELY_KEY is set. Their resolver runs from
//      residential infra so it survives Instagram's anti-bot, returns
//      structured carousel slides + video media at original aspect.
//   2. Public web-app GraphQL — structured edge_sidecar_to_children
//      walk. Often 401's from cloud egress IPs but cheap to try.
//   3. Re-fetch the post page with a browser UA and grep all
//      `display_url` values from the inline JSON, in order. Logged-out
//      HTML usually only carries the first slide.
//   4. Microlink free tier — single image, no carousel, no video flag.
//
// First non-empty list wins.
export async function fetchInstagramOriginalImages(
  href: string,
  shortcode: string,
): Promise<InstagramSlide[]> {
  const fromIframely = await fetchInstagramIframely(href);
  if (fromIframely.length > 0)
    return fromIframely.slice(0, MAX_INSTAGRAM_SLIDES);

  const fromGraph = await fetchInstagramGraphQL(shortcode);
  if (fromGraph.length > 0) return fromGraph.slice(0, MAX_INSTAGRAM_SLIDES);

  const html = await fetchInstagramHtmlAsBrowser(href);
  if (html) {
    const urls = extractDisplayUrlsFromHtml(html);
    if (urls.length > 0) {
      return urls.slice(0, MAX_INSTAGRAM_SLIDES).map((url) => ({ url }));
    }
  }

  const fromMicrolink = await fetchMicrolinkImage(href);
  return fromMicrolink ? [{ url: fromMicrolink }] : [];
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
