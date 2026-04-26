"use client";

import { getColor } from "colorthief";
import { ImageIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { colorMetaFromRgb } from "@/lib/color";
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

type Probed = {
  width: number;
  height: number;
  colorHex: string | null;
  colorHue: number | null;
};

async function probeImage(file: File): Promise<Probed | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      let colorHex: string | null = null;
      let colorHue: number | null = null;
      try {
        const c = await getColor(img);
        if (c) {
          const rgb = c.rgb();
          const meta = colorMetaFromRgb(rgb.r, rgb.g, rgb.b);
          colorHex = meta.hex;
          colorHue = meta.hue;
        }
      } catch {
        /* color extraction is best-effort */
      }
      URL.revokeObjectURL(url);
      resolve({ ...dims, colorHex, colorHue });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export function DropZone({
  files,
  onChange,
}: {
  files: UploadFile[];
  onChange: (files: UploadFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

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
