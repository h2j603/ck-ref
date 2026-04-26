import { NextResponse } from "next/server";

import {
  FETCH_TIMEOUT_MS,
  MAX_BYTES,
  OG_USER_AGENT,
  safeUrl,
} from "@/lib/og";

export async function GET(request: Request) {
  const target = safeUrl(new URL(request.url).searchParams.get("url"));
  if (!target) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(target.href, {
      headers: { "User-Agent": OG_USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
  if (!ct.startsWith("image/")) {
    return NextResponse.json(
      { error: "이미지가 아닌 파일이에요." },
      { status: 415 },
    );
  }
  const len = res.headers.get("content-length");
  if (len && Number(len) > MAX_BYTES) {
    return NextResponse.json({ error: "이미지가 너무 커요." }, { status: 413 });
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
