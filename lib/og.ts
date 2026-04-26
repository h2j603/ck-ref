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

export function parseOg(html: string, baseHref: string): OgMeta {
  // Cap the slice we scan so a multi-MB page doesn't blow up regex backtracking.
  const head = html.slice(0, Math.min(html.length, 256 * 1024));

  const image = resolveAbsolute(
    metaContent(head, "og:image") ??
      metaContent(head, "twitter:image") ??
      metaContent(head, "twitter:image:src"),
    baseHref,
  );
  const title =
    metaContent(head, "og:title") ??
    metaContent(head, "twitter:title") ??
    titleTag(head);
  const description =
    metaContent(head, "og:description") ??
    metaContent(head, "twitter:description") ??
    metaContent(head, "description");
  const siteName = metaContent(head, "og:site_name");

  return { image, title, description, siteName };
}
