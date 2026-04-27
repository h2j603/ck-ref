import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import { isProfileKey } from "@/lib/profiles";

// iOS Safari (and some CDNs) hold on to HTML responses across navigations
// even when the route is fully dynamic. After an upload we do a hard nav
// back to "/", but the browser was happily reusing its disk-cached copy and
// the new ref never showed up. Force every authenticated HTML response to
// be uncached so a hard nav always re-renders the RSC.
const NO_STORE = "private, no-store, no-cache, must-revalidate, max-age=0";

export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(ARCHIVE_AUTH_COOKIE)?.value;
  // The cookie now carries the profile key; treat any known key as
  // authenticated and reject anything else (including the legacy "1").
  if (cookie && isProfileKey(cookie)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", NO_STORE);
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  }
  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.searchParams.set("from", request.nextUrl.pathname);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

export const config = {
  // run on every path except /gate, /api/auth, /api/discord-webhook
  // (server-to-server, no user cookie), static files, and Next internals
  matcher: [
    "/((?!gate|api/auth|api/discord-webhook|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
