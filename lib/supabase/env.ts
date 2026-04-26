// Returns Supabase config. When env is not set we return placeholder values so
// that build-time prerender doesn't crash; the placeholders will fail at the
// first network call, which is what you want during local setup.
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return {
    url: url || "https://placeholder.supabase.co",
    anonKey: anonKey || "placeholder-anon-key",
    configured: Boolean(url && anonKey),
  };
}

export function assertSupabaseConfigured() {
  const { configured } = getSupabaseEnv();
  if (!configured) {
    throw new Error(
      "Supabase 환경변수가 비어있습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 채워주세요.",
    );
  }
}

export const STORAGE_BUCKET = "refs";
