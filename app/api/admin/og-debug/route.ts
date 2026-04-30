import { NextResponse } from "next/server";

import { inspectInstagramExtraction, safeUrl } from "@/lib/og";

export async function GET(request: Request) {
  const target = safeUrl(new URL(request.url).searchParams.get("url"));
  if (!target) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  const report = await inspectInstagramExtraction(target.href);
  return NextResponse.json(report);
}
