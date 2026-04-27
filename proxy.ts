import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ARCHIVE_AUTH_COOKIE } from "@/lib/auth";
import {
  DISCORD_TRUST_COOKIE,
  DISCORD_TRUST_MAX_AGE,
  DISCORD_TRUST_QUERY,
  isValidDiscordTrustToken,
} from "@/lib/discordTrust";
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

  // Server-to-server callers (Supabase Database Webhooks, etc.) hitting an
  // /api path that isn't in the matcher exclusion list don't have our auth
  // cookie. Redirecting them to /gate just makes pg_net follow the redirect
  // and store the HTML of the gate page in net._http_response — looks like
  // a 200 OK but the real handler never ran. Return a JSON 401 instead so
  // the misconfiguration is visible in the response body.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "unauthorized",
        reason: "no_archive_auth_cookie",
        path: request.nextUrl.pathname,
      },
      {
        status: 401,
        headers: { "Cache-Control": NO_STORE },
      },
    );
  }

  // Discord deep links carry a signed ?d=<token>. When the token validates,
  // mark the session as trusted so the gate can skip the password step on
  // the next page-load — clicking from Discord shouldn't require typing the
  // password again.
  const trustToken = request.nextUrl.searchParams.get(DISCORD_TRUST_QUERY);
  const grantTrust = trustToken && isValidDiscordTrustToken(trustToken);

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.searchParams.set("from", request.nextUrl.pathname);
  url.searchParams.delete(DISCORD_TRUST_QUERY);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", NO_STORE);
  if (grantTrust) {
    response.cookies.set(DISCORD_TRUST_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DISCORD_TRUST_MAX_AGE,
    });
  }
  return response;
}

export const config = {
  // run on every path except /gate, /api/auth, /api/discord-webhook,
  // /api/embed-ref/backfill (all server-to-server, no user cookie),
  // static files, and Next internals
  matcher: [
    "/((?!gate|api/auth|api/discord-webhook|api/embed-ref/backfill|api/cron|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
