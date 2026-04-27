"use client";

import { ImageIcon, Link2, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { probeImage } from "@/lib/imageProbe";
import { cn } from "@/lib/utils";

export type UploadFile = {
  id: string;
  file: File;
  previewUrl: string;
  width?: number;
  height?: number;
  colorHex?: string | null;
  colorHue?: number | null;
};

function fileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function extFromMime(mime: string): string {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("avif")) return "avif";
  return "img";
}

export function DropZone({
  files,
  onChange,
  onUrlFetched,
  genre,
}: {
  files: UploadFile[];
  onChange: (files: UploadFile[]) => void;
  onUrlFetched?: (info: { url: string; title?: string }) => void;
  // The current genre selection on the form. When "web" the URL fetch
  // uses Are.na-style screenshots; otherwise it uses og:image so we
  // capture the actual artwork rather than the page chrome.
  genre?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      for (const f of files) URL.revokeObjectURL(f.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    async (incoming: File[]) => {
      const accepted = incoming.filter((f) => f.type.startsWith("image/"));
      const existingIds = new Set(files.map((f) => f.id));
      const next: UploadFile[] = [];
      for (const file of accepted) {
        const id = fileId(file);
        if (existingIds.has(id)) continue;
        const probed = await probeImage(file);
        next.push({
          id,
          file,
          previewUrl: URL.createObjectURL(file),
          width: probed?.width,
          height: probed?.height,
          colorHex: probed?.colorHex ?? null,
          colorHue: probed?.colorHue ?? null,
        });
      }
      if (next.length > 0) onChange([...files, ...next]);
    },
    [files, onChange],
  );

  function removeFile(id: string) {
    const target = files.find((f) => f.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(files.filter((f) => f.id !== id));
  }

  async function fetchFromUrl() {
    setUrlError(null);
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setUrlError("URL 형식이 올바르지 않아요.");
      return;
    }
    setUrlBusy(true);
    try {
      const mode = genre === "web" ? "screenshot" : "og";
      const res = await fetch(
        `/api/og-thumb?url=${encodeURIComponent(parsed.href)}&mode=${mode}`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setUrlError(data?.error ?? `썸네일을 가져오지 못했어요 (${res.status})`);
        return;
      }
      const titleRaw = res.headers.get("x-og-title");
      const title = titleRaw ? decodeURIComponent(titleRaw) : undefined;
      const blob = await res.blob();
      const ext = extFromMime(blob.type);
      const filename = `${parsed.hostname.replace(/[^a-z0-9]+/gi, "-")}.${ext}`;
      const file = new File([blob], filename, { type: blob.type });
      await addFiles([file]);
      onUrlFetched?.({ url: parsed.href, title });
      setUrlInput("");
    } catch (err) {
      setUrlError(
        err instanceof Error ? err.message : "썸네일을 가져오지 못했어요.",
      );
    } finally {
      setUrlBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = Array.from(e.dataTransfer.files ?? []);
          void addFiles(dropped);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-input px-6 py-12 text-center transition-colors",
          dragOver
            ? "border-foreground bg-muted/50"
            : "hover:border-foreground/60 hover:bg-muted/30",
        )}
      >
        <ImageIcon className="size-5 text-muted-foreground" />
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          drop or click to add images
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <Link2 aria-hidden className="size-3" />
          URL에서 썸네일 가져오기
        </label>
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void fetchFromUrl();
              }
            }}
            placeholder="https://..."
            disabled={urlBusy}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchFromUrl()}
            disabled={urlBusy || !urlInput.trim()}
          >
            {urlBusy ? (
              <>
                <Loader2 className="size-3 animate-spin" /> 가져오는 중
              </>
            ) : (
              "가져오기"
            )}
          </Button>
        </div>
        {urlError ? (
          <p className="text-xs text-destructive">{urlError}</p>
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {genre === "web"
              ? "장르 web — 페이지 스크린샷을 떠와요. 소스 URL도 자동 입력."
              : "og:image를 받아 썸네일로 추가해요. 소스 URL도 자동 입력. (장르 web에서는 스크린샷)"}
          </p>
        )}
      </div>
      {files.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {files.map((f) => (
            <li key={f.id} className="group relative overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.previewUrl}
                alt={f.file.name}
                className="block h-32 w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeFile(f.id)}
                className="absolute right-1 top-1 hidden rounded-full bg-background/90 p-1 group-hover:block"
                aria-label="remove"
              >
                <X className="size-3" />
              </button>
              <p className="truncate px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                {f.file.name}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
