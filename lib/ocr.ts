"use client";

// Thin wrapper around tesseract.js. The library is heavy (loads WASM +
// per-language traineddata) so we lazy-import it on first use and reuse
// the worker across all subsequent calls in the same session. Korean +
// English cover ~all of our actual refs; if a non-CJK Latin language
// shows up, the eng model still does a reasonable job.

type WorkerLike = {
  recognize(input: File | Blob): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};

let workerPromise: Promise<WorkerLike> | null = null;

async function getWorker(): Promise<WorkerLike> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const { createWorker } = await import("tesseract.js");
    return (await createWorker(["kor", "eng"])) as unknown as WorkerLike;
  })();
  return workerPromise;
}

export async function runOCR(file: File | Blob): Promise<string> {
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(file);
    return collapseWhitespace(data.text);
  } catch (err) {
    // OCR failure shouldn't break the upload — log and return empty so
    // the row insert still proceeds without ocr_text.
    console.warn("ocr failed", err);
    return "";
  }
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
