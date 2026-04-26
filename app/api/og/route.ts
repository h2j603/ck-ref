import { NextResponse } from "next/server";

import {
  FETCH_TIMEOUT_MS,
  OG_USER_AGENT,
  parseOg,
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

  if (!res.ok) {
    return NextResponse.json(
      { error: `원격 서버 응답 ${res.status}` },
      { status: 502 },
    );
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("xml")) {
    return NextResponse.json(
      { error: "HTML 페이지가 아니에요." },
      { status: 415 },
    );
  }

  const html = await res.text();
  const meta = parseOg(html, res.url || target.href);
  return NextResponse.json({ ...meta, sourceUrl: target.href });
}
