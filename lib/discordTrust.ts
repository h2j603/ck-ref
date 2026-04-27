// Signed marker that proves a request originated from a link the Discord
// webhook posted. The Discord channel itself is the gate (only team members
// see it), so clicking a link from there can skip the password step.
//
// The token is a static HMAC of a fixed payload: it doesn't bind to a path
// or expire. Whoever has the secret (the server) can mint it; whoever can
// read the link (Discord channel) can use it. Rotating the secret invalidates
// every minted link at once.
//
// We deliberately do NOT include identity in the token — clicking a link
// just lets you skip the password dialog on /gate. You still pick which
// profile you are.

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const DISCORD_TRUST_COOKIE = "discord_trust";
export const DISCORD_TRUST_MAX_AGE = 60 * 60 * 24; // 24h
export const DISCORD_TRUST_QUERY = "d";

const PAYLOAD = "discord-trust-v1";

function secret(): string | null {
  return (
    process.env.DISCORD_LINK_SECRET || process.env.SUPABASE_WEBHOOK_SECRET || null
  );
}

export function discordTrustToken(): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac("sha256", s).update(PAYLOAD).digest("base64url");
}

export function isValidDiscordTrustToken(candidate: unknown): boolean {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const expected = discordTrustToken();
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Append the trust token to a link the webhook is about to post. The query
// goes before any hash fragment so anchors keep working. No-op when the
// secret is missing (returns the original URL).
export function appendDiscordTrust(url: string): string {
  const token = discordTrustToken();
  if (!token) return url;
  const hashIdx = url.indexOf("#");
  const base = hashIdx === -1 ? url : url.slice(0, hashIdx);
  const hash = hashIdx === -1 ? "" : url.slice(hashIdx);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${DISCORD_TRUST_QUERY}=${token}${hash}`;
}
