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
  "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/clip-ViT-B-32";

const DEFAULT_DIM = 512;

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

export async function embedImage(imageUrl: string): Promise<number[] | null> {
  const tk = token();
  if (!tk) return null;
  const url = process.env.EMBEDDING_API_URL || DEFAULT_URL;

  // Pull the image bytes ourselves rather than handing the provider a URL —
  // public Supabase storage URLs can occasionally rate-limit anonymous
  // hot-link traffic, and this also lets us send the right Content-Type.
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    console.error("embed: failed to fetch image", imgRes.status);
    return null;
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tk}`,
      "Content-Type": contentType,
    },
    body: buf,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("embed: provider rejected", res.status, body.slice(0, 200));
    return null;
  }
  const json = (await res.json().catch(() => null)) as unknown;
  const flat = flatten(json);
  if (!flat) return null;
  if (flat.length !== expectedDim()) {
    console.warn(
      `embed: dimension mismatch — got ${flat.length}, expected ${expectedDim()}`,
    );
    return null;
  }
  return flat;
}

// Postgres expects a vector literal like '[0.1,0.2,...]'. Supabase JS lets
// you pass arrays directly when the column is `vector`, but the textual
// form works everywhere and is what `similar_refs_by_embedding` accepts
// when called via rpc.
export function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
