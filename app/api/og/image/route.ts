import { NextResponse } from "next/server";

import { FETCH_TIMEOUT_MS, MAX_BYTES, safeUrl } from "@/lib/og";

// A normal browser UA + Referer so Instagram's CDN serves video bytes
// rather than redirecting to a login interstitial. The Facebook
// crawler UA we use elsewhere works for og:image fetches but gets a
// different (often empty) response for /o1/v/...mp4 video URLs.
const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export async function GET(request: Request) {
  const target = safeUrl(new URL(request.url).searchParams.get("url"));
  if (!target) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const isInstagramCdn = /(?:^|\.)cdninstagram\.com$/i.test(target.hostname);
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: "image/*,video/*,*/*;q=0.8",
  };
  if (isInstagramCdn) {
    headers.Referer = "https://www.instagram.com/";
  }

  let res: Response;
  try {
    res = await fetch(target.href, {
      headers,
      redirect: "follow",
      // Videos can be 10s+ MB — give them more time to stream.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 3),
    });
  } catch {
    return NextResponse.json(
      { error: "이미지를 불러오지 못했어요." },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: `이미지 응답 ${res.status}` },
      { status: 502 },
    );
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/") && !ct.startsWith("video/")) {
    return NextResponse.json(
      { error: `이미지·비디오가 아닌 파일이에요. (${ct || "unknown"})` },
      { status: 415 },
    );
  }
  const len = res.headers.get("content-length");
  if (len && Number(len) > MAX_BYTES) {
    return NextResponse.json({ error: "파일이 너무 커요." }, { status: 413 });
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return new NextResponse("Too large", { status: 413 });
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=300",
    },
  });
}
