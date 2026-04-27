// Weekly nudge messages shown when the signed-in user hasn't uploaded yet
// this week. The server picks one at random per request — varying the line
// keeps it from feeling like spam.

export const WEEKLY_NUDGES = [
  "이번 주 인덱스가 비어 있어요. 가볍게 한 장만.",
  "오늘 본 가장 좋은 거 하나, 인덱스에 부탁해요.",
  "한 주가 끝나기 전에 도장 한 번 찍어주세요.",
  "주간 키위 충전, 아직이에요. 한 알 풀어줘요.",
  "이번 주 첫 ref, 기다리고 있어요.",
] as const;

export function pickNudge(seed?: number): string {
  const i =
    typeof seed === "number"
      ? Math.abs(seed) % WEEKLY_NUDGES.length
      : Math.floor(Math.random() * WEEKLY_NUDGES.length);
  return WEEKLY_NUDGES[i];
}
