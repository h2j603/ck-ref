import { NextResponse } from "next/server";

import {
  FETCH_TIMEOUT_MS,
  MAX_BYTES,
  OG_USER_AGENT,
  parseOg,
  safeUrl,
} from "@/lib/og";

// "Are.na-style" thumbnail fetch: given a page URL, resolve its
// og:image (or twitter:image / first <img> in <head>) and stream the
// image bytes back. Used by the upload page to let users paste a link
// and get a cover for the ref without having to download/upload by hand.

export async function GET(request: Request) {
  const target = safeUrl(new URL(request.url).searchParams.get("url"));
  if (!target) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Step 1: pull the page HTML and extract og metadata.
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
    return NextResponse.json(
      { error: "URL을 불러오지 못했어요." },
      { status: 502 },
    );
  }
  if (!pageRes.ok) {
    return NextResponse.json(
      { error: `원격 서버 응답 ${pageRes.status}` },
      { status: 502 },
    );
  }
  const ct = pageRes.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("xml")) {
    return NextResponse.json(
      { error: "HTML 페이지가 아니에요." },
      { status: 415 },
    );
  }
  const html = await pageRes.text();
  const meta = parseOg(html, pageRes.url || target.href);
  if (!meta.image) {
    return NextResponse.json(
      { error: "이 페이지에서 og:image를 찾지 못했어요." },
      { status: 404 },
    );
  }

  // Step 2: download the OG image itself.
  let imgRes: Response;
  try {
    imgRes = await fetch(meta.image, {
      headers: { "User-Agent": OG_USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json(
      { error: "썸네일 이미지를 가져오지 못했어요." },
      { status: 502 },
    );
  }
  if (!imgRes.ok) {
    return NextResponse.json(
      { error: `이미지 응답 ${imgRes.status}` },
      { status: 502 },
    );
  }
  const imgCt = imgRes.headers.get("content-type") ?? "";
  if (!imgCt.startsWith("image/")) {
    return NextResponse.json(
      { error: "썸네일이 이미지가 아니에요." },
      { status: 415 },
    );
  }
  const len = imgRes.headers.get("content-length");
  if (len && Number(len) > MAX_BYTES) {
    return NextResponse.json({ error: "이미지가 너무 커요." }, { status: 413 });
  }

  const buf = await imgRes.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return new NextResponse("Too large", { status: 413 });
  }

  // Surface the metadata we already fetched as headers so the client can
  // pre-fill the title field without a second round trip.
  const headers = new Headers({
    "Content-Type": imgCt,
    "Cache-Control": "public, max-age=300",
  });
  if (meta.title) {
    // Header values must be ASCII; encode and let the client decode.
    headers.set("X-Og-Title", encodeURIComponent(meta.title));
  }
  return new NextResponse(buf, { status: 200, headers });
}
