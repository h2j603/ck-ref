// Fixed roster — three known users. Order is deliberate; the picker renders
// in this order. To add or remove a profile, change this list.
export const PROFILES = [
  { nickname: "하진", color: "#e9c46a" },
  { nickname: "미주", color: "#48cae4" },
  { nickname: "혁", color: "#e879c2" },
] as const;

export type Profile = (typeof PROFILES)[number];

export function findProfile(nickname: string): Profile | null {
  return PROFILES.find((p) => p.nickname === nickname) ?? null;
}
