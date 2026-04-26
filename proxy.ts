import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import { isProfileKey } from "@/lib/profiles";

export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(ARCHIVE_AUTH_COOKIE)?.value;
  // The cookie now carries the profile key; treat any known key as
  // authenticated and reject anything else (including the legacy "1").
  if (cookie && isProfileKey(cookie)) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.searchParams.set("from", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // run on every path except /gate, /api/auth, static files, and Next internals
  matcher: ["/((?!gate|api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
