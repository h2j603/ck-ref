// The cookie value is the profile key (e.g. 하진/미주/혁) rather than a flat
// "1", so the proxy can identify *which* profile is authenticated and the
// server can read it back where needed.
export const ARCHIVE_AUTH_COOKIE = "archive_auth";
export const ARCHIVE_AUTH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
