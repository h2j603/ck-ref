"use client";

import { ImageIcon, Plus, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { probeImage, type ProbedImage } from "@/lib/imageProbe";
import { useNickname } from "@/lib/nickname";
import { STORAGE_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

function fileExt(file: File) {
  const dot = file.name.lastIndexOf(".");
  if (dot >= 0) return file.name.slice(dot + 1).toLowerCase();
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "bin";
}

function updatePath(projectId: string, ext: string) {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `projects/${projectId}/${stamp}-${rand}.${ext}`;
}

export function AddUpdateForm({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated || !nickname) return null;

  function pickFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setBody("");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    if (!file) {
      setError("이미지를 추가해주세요.");
      return;
    }
    setBusy(true);
    try {
      const probed: ProbedImage | null = await probeImage(file);
      const path = updatePath(projectId, fileExt(file));
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
          cacheControl: "31536000",
          upsert: false,
          contentType: file.type || undefined,
        });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("project_updates").insert({
        project_id: projectId,
        image_path: path,
        image_width: probed?.width ?? null,
        image_height: probed?.height ?? null,
        body: body.trim() || null,
        created_by: nickname,
      });
      if (insErr) throw insErr;
      window.location.reload();
    } catch (err) {
      console.error("update insert failed", err);
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 self-start px-2 text-[11px]"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3" /> 업데이트 추가
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          새 업데이트
        </p>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-muted-foreground hover:text-foreground"
          aria-label="close"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-input bg-background"
          aria-label="이미지 선택"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="preview"
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </button>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="이번 업데이트 메모 (선택)"
          className="flex-1 text-sm"
          disabled={busy}
        />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={reset}
          disabled={busy}
        >
          비우기
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSubmit()}
          disabled={busy || !file}
        >
          {busy ? "올리는 중…" : "올리기"}
        </Button>
      </div>
    </div>
  );
}
