import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const N = 16384;

// Stored as `{salt-hex}:{derived-hex}`. scrypt is a built-in KDF — no
// dependency added. For a 3-user internal tool this is plenty.
export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ?? randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEYLEN, { N }).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const idx = stored.indexOf(":");
  if (idx < 0) return false;
  const salt = stored.slice(0, idx);
  const expectedHex = stored.slice(idx + 1);
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  const actual = scryptSync(password, salt, expected.length, { N });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
