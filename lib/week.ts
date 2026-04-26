// "이번 주" semantics for the upload nudge: Monday 00:00 KST. Vercel runs in
// UTC, so we compute the KST Monday and convert back to a UTC ISO timestamp
// for Postgres `created_at` comparisons.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function startOfThisWeekUtcIso(now: Date = new Date()): string {
  const inKst = new Date(now.getTime() + KST_OFFSET_MS);
  const dow = inKst.getUTCDay(); // 0 = Sun, 1 = Mon, …
  const daysToMonday = (dow + 6) % 7; // Mon → 0, Sun → 6

  const mondayKstFields = new Date(inKst);
  mondayKstFields.setUTCHours(0, 0, 0, 0);
  mondayKstFields.setUTCDate(mondayKstFields.getUTCDate() - daysToMonday);

  // The fields above describe Monday 00:00 KST. The actual UTC instant is
  // 9 hours earlier than what those fields say.
  return new Date(mondayKstFields.getTime() - KST_OFFSET_MS).toISOString();
}
