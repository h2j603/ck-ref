// Curated set of countries that produce design we'd plausibly archive. The
// `code` is the ISO alpha-2; `label` is what we show and store in
// `designers.origin`. Keep additions ASCII for the storage value.

export const COUNTRIES = [
  { code: "KR", label: "한국 · KR" },
  { code: "JP", label: "일본 · JP" },
  { code: "CN", label: "중국 · CN" },
  { code: "TW", label: "대만 · TW" },
  { code: "HK", label: "홍콩 · HK" },
  { code: "US", label: "미국 · US" },
  { code: "GB", label: "영국 · GB" },
  { code: "DE", label: "독일 · DE" },
  { code: "NL", label: "네덜란드 · NL" },
  { code: "CH", label: "스위스 · CH" },
  { code: "FR", label: "프랑스 · FR" },
  { code: "IT", label: "이탈리아 · IT" },
  { code: "ES", label: "스페인 · ES" },
  { code: "BE", label: "벨기에 · BE" },
  { code: "SE", label: "스웨덴 · SE" },
  { code: "NO", label: "노르웨이 · NO" },
  { code: "DK", label: "덴마크 · DK" },
  { code: "FI", label: "핀란드 · FI" },
  { code: "AT", label: "오스트리아 · AT" },
  { code: "CA", label: "캐나다 · CA" },
  { code: "AU", label: "호주 · AU" },
  { code: "BR", label: "브라질 · BR" },
  { code: "MX", label: "멕시코 · MX" },
  { code: "IL", label: "이스라엘 · IL" },
  { code: "IN", label: "인도 · IN" },
  { code: "SG", label: "싱가포르 · SG" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

const LABEL_BY_CODE = new Map<string, string>(
  COUNTRIES.map((c) => [c.code, c.label]),
);
const CODE_BY_LABEL = new Map<string, CountryCode>(
  COUNTRIES.map((c) => [c.label, c.code]),
);

// Try to recognize a stored origin string as one of the known countries.
// Existing rows might be pre-Select free text like "Seoul, KR" — we only
// promote to a known option if it matches a label or a code exactly.
export function matchCountry(origin: string | null | undefined): {
  code: CountryCode | null;
  freeText: string;
} {
  if (!origin) return { code: null, freeText: "" };
  if (CODE_BY_LABEL.has(origin)) {
    return { code: CODE_BY_LABEL.get(origin)!, freeText: "" };
  }
  if (LABEL_BY_CODE.has(origin)) {
    return { code: origin as CountryCode, freeText: "" };
  }
  return { code: null, freeText: origin };
}

export function labelForCode(code: CountryCode): string {
  return LABEL_BY_CODE.get(code) ?? code;
}
