// The roster keys are immutable — they're what we store in localStorage and
// in created_by/author columns, and they identify the row in the profiles
// table. display_name and avatar are editable per row in Supabase; this list
// is the seed/fallback used when the DB hasn't been read yet.

export const PROFILE_KEYS = ["하진", "미주", "혁"] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

export type Profile = {
  key: ProfileKey;
  display_name: string;
  avatar_path: string | null;
  color: string;
};

const DEFAULT_COLOR: Record<ProfileKey, string> = {
  "하진": "#e9c46a",
  "미주": "#48cae4",
  "혁": "#e879c2",
};

export const FALLBACK_PROFILES: Profile[] = PROFILE_KEYS.map((key) => ({
  key,
  display_name: key,
  avatar_path: null,
  color: DEFAULT_COLOR[key],
}));

export function findProfile(
  profiles: Profile[],
  nickname: string | null,
): Profile | null {
  if (!nickname) return null;
  return profiles.find((p) => p.key === nickname) ?? null;
}
