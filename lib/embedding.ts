import "server-only";

// Server-side image-embedding helper. Two providers are supported out of
// the box:
//
//   1. Jina (default, recommended). Set JINA_API_TOKEN. Free tier is
//      generous and the API is stable. Default model jina-clip-v1
//      returns 768-dim embeddings — schema's `refs.embedding` column
//      matches that out of the box.
//
//   2. Generic HTTP provider. Set EMBEDDING_API_URL and
//      EMBEDDING_API_TOKEN (or HF_API_TOKEN as a legacy fallback) for
//      a Hugging Face / Replicate / etc. endpoint that takes raw image
//      bytes and returns an embedding array. EMBEDDING_DIM controls
//      the expected length; mismatch is rejected.
//
// When no provider is configured, every call returns `{ ok: false,
// reason: "no_token" }` and the rest of the app falls back to the
// metadata-only similarity path silently.

export type EmbedResult =
  | { ok: true; embedding: number[] }
  | { ok: false; reason: string };

const JINA_URL = "https://api.jina.ai/v1/embeddings";
const JINA_DEFAULT_MODEL = "jina-clip-v1";
const JINA_DEFAULT_DIM = 768;

function jinaToken(): string | null {
  return process.env.JINA_API_TOKEN || null;
}

function genericToken(): string | null {
  return (
    process.env.EMBEDDING_API_TOKEN || process.env.HF_API_TOKEN || null
  );
}

export function embeddingsConfigured(): boolean {
  // True only if a provider is fully usable. Having the legacy generic
  // token without a URL doesn't count — that path returns a hard error
  // on every call, which would mislead the admin status indicator.
  if (jinaToken()) return true;
  if (genericToken() && process.env.EMBEDDING_API_URL) return true;
  return false;
}

// Which provider would the next call use? Helpful in admin UIs.
export function embeddingsProvider(): "jina" | "generic" | "none" {
  if (jinaToken()) return "jina";
  if (genericToken() && process.env.EMBEDDING_API_URL) return "generic";
  return "none";
}

function genericExpectedDim(): number {
  const raw = process.env.EMBEDDING_DIM;
  const n = raw ? Number(raw) : JINA_DEFAULT_DIM;
  return Number.isFinite(n) && n > 0 ? n : JINA_DEFAULT_DIM;
}

// Some endpoints return [[...512 floats...]] (a 1×N matrix), others
// return [...512 floats...]. Flatten one level if the first element is
// itself an array.
function flatten(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  if (Array.isArray(raw[0])) {
    return Array.isArray(raw[0]) ? (raw[0] as number[]) : null;
  }
  return raw as number[];
}

async function fetchImageBase64(
  imageUrl: string,
): Promise<
  { ok: true; base64: string; contentType: string; bytes: Buffer }
  | { ok: false; reason: string }
> {
  let imgRes: Response;
  try {
    imgRes = await fetch(imageUrl);
  } catch (err) {
    return {
      ok: false,
      reason: `fetch_image_network:${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!imgRes.ok) {
    return { ok: false, reason: `fetch_image:${imgRes.status}` };
  }
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  return { ok: true, base64: bytes.toString("base64"), contentType, bytes };
}

async function embedViaJina(imageUrl: string): Promise<EmbedResult> {
  const tk = jinaToken();
  if (!tk) return { ok: false, reason: "no_token" };
  const model = process.env.JINA_MODEL || JINA_DEFAULT_MODEL;

  // Send the image URL rather than base64 bytes — Jina fetches it server
  // side. This drops the request size (and the input token count, since
  // they meter on data) dramatically: a full-res photo sent as base64
  // can blow past their per-minute limit in a couple of calls. The
  // storage URLs are public, so no auth handshake is needed.

  let res: Response;
  try {
    res = await fetch(JINA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tk}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model,
        input: [{ image: imageUrl }],
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: `jina_network:${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      reason: `jina_${res.status}:${text.slice(0, 200)}`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: `jina_parse:${text.slice(0, 100)}` };
  }
  type JinaResponse = {
    data?: { embedding?: number[]; index?: number }[];
    detail?: string;
  };
  const j = json as JinaResponse;
  const embedding = j.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    return {
      ok: false,
      reason: `jina_shape:${JSON.stringify(json).slice(0, 120)}`,
    };
  }
  return { ok: true, embedding };
}

async function embedViaGeneric(imageUrl: string): Promise<EmbedResult> {
  const tk = genericToken();
  if (!tk) return { ok: false, reason: "no_token" };
  const url = process.env.EMBEDDING_API_URL;
  if (!url) {
    return { ok: false, reason: "no_url_for_generic_provider" };
  }
  const fetched = await fetchImageBase64(imageUrl);
  if (!fetched.ok) return fetched;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tk}`,
        "Content-Type": fetched.contentType,
        "x-wait-for-model": "true",
      },
      body: new Uint8Array(fetched.bytes),
    });
  } catch (err) {
    return {
      ok: false,
      reason: `generic_network:${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      reason: `generic_${res.status}:${text.slice(0, 200)}`,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: `generic_parse:${text.slice(0, 100)}` };
  }
  const flat = flatten(json);
  if (!flat) {
    return {
      ok: false,
      reason: `generic_shape:${JSON.stringify(json).slice(0, 100)}`,
    };
  }
  const expected = genericExpectedDim();
  if (flat.length !== expected) {
    return {
      ok: false,
      reason: `dim:got_${flat.length}_expected_${expected}`,
    };
  }
  return { ok: true, embedding: flat };
}

export async function embedImage(imageUrl: string): Promise<EmbedResult> {
  if (jinaToken()) return embedViaJina(imageUrl);
  if (genericToken()) return embedViaGeneric(imageUrl);
  return { ok: false, reason: "no_token" };
}

// Postgres expects a vector literal like '[0.1,0.2,...]'. Supabase JS lets
// you pass arrays directly when the column is `vector`, but the textual
// form works everywhere and is what `similar_refs_by_embedding` accepts
// when called via rpc.
export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
