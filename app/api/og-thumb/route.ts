import { NextResponse } from "next/server";

import {
  FETCH_TIMEOUT_MS,
  MAX_BYTES,
  OG_USER_AGENT,
  parseOg,
  safeUrl,
} from "@/lib/og";

// "Are.na-style" thumbnail fetch: given a page URL, render the page and
// hand back a screenshot. We use Microlink (https://microlink.io) — the
// free tier handles 50 requests/day per IP, plenty for a 3-person team.
// MICROLINK_API_KEY can be set to enable the paid pro tier with higher
// limits and faster cold starts.
//
// If Microlink fails (rate limited, target unreachable, paywalled site,
// etc.) we fall back to the original og:image extraction so the user
// still gets a thumbnail when one is available.

const MICROLINK_API = "https://api.microlink.io";
const MICROLINK_PRO_API = "https://pro.microlink.io";

type Result = {
  buf: ArrayBuffer;
  contentType: string;
  title: string | null;
  source: "screenshot" | "og";
};

async function fromMicrolink(url: string): Promise<Result | null> {
  const key = process.env.MICROLINK_API_KEY?.trim() || null;
  const endpoint = key ? MICROLINK_PRO_API : MICROLINK_API;
  const params = new URLSearchParams({
    url,
    screenshot: "true",
    meta: "true",
    // Bigger viewport so editorial layouts read better in the thumbnail.
    viewport: "1280x800",
  });
  let res: Response;
  try {
    res = await fetch(`${endpoint}?${params.toString()}`, {
      headers: key ? { "x-api-key": key } : {},
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 3),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  type MicrolinkResp = {
    status?: string;
    data?: {
      title?: string | null;
      screenshot?: { url?: string | null } | null;
    };
  };
  const j = json as MicrolinkResp;
  if (j.status !== "success") return null;
  const screenshotUrl = j.data?.screenshot?.url;
  if (!screenshotUrl) return null;

  // Microlink hosts the screenshot on their CDN — proxy it through us so
  // the upload page doesn't have to deal with cross-origin reads.
  let imgRes: Response;
  try {
    imgRes = await fetch(screenshotUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!imgRes.ok) return null;
  const ct = imgRes.headers.get("content-type") || "image/png";
  if (!ct.startsWith("image/")) return null;
  const len = imgRes.headers.get("content-length");
  if (len && Number(len) > MAX_BYTES) return null;
  const buf = await imgRes.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return null;
  return {
    buf,
    contentType: ct,
    title: j.data?.title?.trim() || null,
    source: "screenshot",
  };
}

async function fromOgImage(target: URL): Promise<Result | null> {
  let pageRes: Response;
  try {
    pageRes = await fetch(target.href, {
      headers: {
        "User-Agent": OG_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5,ko;q=0.3",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!pageRes.ok) return null;
  const ct = pageRes.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("xml")) return null;
  const html = await pageRes.text();
  const meta = parseOg(html, pageRes.url || target.href);
  if (!meta.image) return null;

  let imgRes: Response;
  try {
    imgRes = await fetch(meta.image, {
      headers: { "User-Agent": OG_USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!imgRes.ok) return null;
  const imgCt = imgRes.headers.get("content-type") ?? "";
  if (!imgCt.startsWith("image/")) return null;
  const len = imgRes.headers.get("content-length");
  if (len && Number(len) > MAX_BYTES) return null;
  const buf = await imgRes.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return null;
  return { buf, contentType: imgCt, title: meta.title, source: "og" };
}

export async function GET(request: Request) {
  const target = safeUrl(new URL(request.url).searchParams.get("url"));
  if (!target) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Are.na-style: actual page screenshot first.
  const result =
    (await fromMicrolink(target.href)) ?? (await fromOgImage(target));
  if (!result) {
    return NextResponse.json(
      {
        error:
          "스크린샷도, og:image도 가져오지 못했어요. 직접 이미지를 첨부해주세요.",
      },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Content-Type": result.contentType,
    "Cache-Control": "public, max-age=300",
    "X-Thumb-Source": result.source,
  });
  if (result.title) {
    headers.set("X-Og-Title", encodeURIComponent(result.title));
  }
  return new NextResponse(result.buf, { status: 200, headers });
}
