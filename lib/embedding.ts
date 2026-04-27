import "server-only";

// Server-side image-embedding helper. Wraps a generic HTTP embedding API
// (defaults to Hugging Face Inference) so that the rest of the app can
// stay provider-agnostic. When the env var isn't set, the helper returns
// null and callers treat it as "no embedding available" — the visual
// reranker quietly falls back to the metadata-only score path.
//
// Env:
//   EMBEDDING_API_URL    — POST endpoint (default: HF clip-ViT-B-32)
//   EMBEDDING_API_TOKEN  — Bearer token (or HF_API_TOKEN as fallback)
//   EMBEDDING_DIM        — expected output length (default: 512)

const DEFAULT_URL =
  "https://api-inference.huggingface.co/models/sentence-transformers/clip-ViT-B-32";

const DEFAULT_DIM = 512;

export type EmbedResult =
  | { ok: true; embedding: number[] }
  | { ok: false; reason: string };

function token(): string | null {
  return (
    process.env.EMBEDDING_API_TOKEN || process.env.HF_API_TOKEN || null
  );
}

export function embeddingsConfigured(): boolean {
  return token() !== null;
}

function expectedDim(): number {
  const raw = process.env.EMBEDDING_DIM;
  const n = raw ? Number(raw) : DEFAULT_DIM;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DIM;
}

// Some HF endpoints return [[...512 floats...]] (a 1×N matrix), others
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

export async function embedImage(imageUrl: string): Promise<EmbedResult> {
  const tk = token();
  if (!tk) return { ok: false, reason: "no_token" };
  const url = process.env.EMBEDDING_API_URL || DEFAULT_URL;

  // Pull the image bytes ourselves rather than handing the provider a URL —
  // public Supabase storage URLs can occasionally rate-limit anonymous
  // hot-link traffic, and this also lets us send the right Content-Type.
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    return { ok: false, reason: `fetch_image:${imgRes.status}` };
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tk}`,
        "Content-Type": contentType,
        // Some HF deployments return 503 with an `estimated_time` while
        // the model spins up. Asking the client to wait pushes that
        // burden onto the provider rather than us retrying ourselves.
        "x-wait-for-model": "true",
      },
      body: buf,
    });
  } catch (err) {
    return {
      ok: false,
      reason: `network:${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      reason: `provider:${res.status} ${body.slice(0, 200)}`,
    };
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: `parse:${text.slice(0, 100)}` };
  }
  const flat = flatten(json);
  if (!flat) {
    return {
      ok: false,
      reason: `shape:${JSON.stringify(json).slice(0, 100)}`,
    };
  }
  if (flat.length !== expectedDim()) {
    return {
      ok: false,
      reason: `dim:got_${flat.length}_expected_${expectedDim()}`,
    };
  }
  return { ok: true, embedding: flat };
}

// Postgres expects a vector literal like '[0.1,0.2,...]'. Supabase JS lets
// you pass arrays directly when the column is `vector`, but the textual
// form works everywhere and is what `similar_refs_by_embedding` accepts
// when called via rpc.
export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
