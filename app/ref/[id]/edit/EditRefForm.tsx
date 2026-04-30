"use client";

import { ImageIcon, RotateCcw } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { DesignerPicker, type DesignerLite } from "@/components/upload/DesignerPicker";
import { TagPresets } from "@/components/upload/TagPresets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { probeImage, type ProbedImage } from "@/lib/imageProbe";
import { runOCR } from "@/lib/ocr";
import { useNickname } from "@/lib/nickname";
import { parseTags } from "@/lib/slug";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET, assertSupabaseConfigured } from "@/lib/supabase/env";
import {
  GENRES,
  LANGUAGES,
  MEDIUMS,
  type Genre,
  type Language,
  type Medium,
} from "@/lib/types";

const NONE = "__none__";

type Initial = {
  title: string | null;
  year: number | null;
  source_url: string | null;
  genres: Genre[];
  medium: Medium | null;
  languages: Language[];
  tags: string[];
  designers: DesignerLite[];
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  ocr_text: string | null;
};

type PendingImage = {
  file: File;
  previewUrl: string;
  probed: ProbedImage | null;
};

function fileExtension(file: File) {
  const dot = file.name.lastIndexOf(".");
  if (dot >= 0) return file.name.slice(dot + 1).toLowerCase();
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "bin";
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [e.message, e.details, e.hint].filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    if (parts.length > 0) return parts.join(" — ");
  }
  return "저장에 실패했습니다.";
}

export function EditRefForm({
  refId,
  createdBy,
  initial,
}: {
  refId: string;
  createdBy: string | null;
  initial: Initial;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();

  const [title, setTitle] = useState(initial.title ?? "");
  const [year, setYear] = useState(initial.year != null ? String(initial.year) : "");
  const [sourceUrl, setSourceUrl] = useState(initial.source_url ?? "");
  const [genres, setGenres] = useState<Genre[]>(initial.genres);
  const [medium, setMedium] = useState<Medium | typeof NONE>(initial.medium ?? NONE);
  const [languages, setLanguages] = useState<Language[]>(initial.languages);
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [designers, setDesigners] = useState<DesignerLite[]>(initial.designers);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [ocrText, setOcrText] = useState(initial.ocr_text ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

  if (!hydrated) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        loading…
      </p>
    );
  }
  if (!createdBy || nickname !== createdBy) {
    return (
      <p className="text-sm text-muted-foreground">
        본인이 등록한 레퍼런스만 수정할 수 있어요.
      </p>
    );
  }

  function toggleLanguage(lang: Language) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  async function pickFile(file: File) {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    const probed = await probeImage(file);
    setPendingImage({
      file,
      previewUrl: URL.createObjectURL(file),
      probed,
    });
    // Re-run OCR on the new file so the searchable text matches the new
    // image. Stays in state and gets saved on submit; no UI surface.
    void runOCR(file).then((text) => setOcrText(text));
  }

  function clearPending() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    setOcrText(initial.ocr_text ?? "");
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tags = parseTags(tagsText);
      const yearNum = year.trim() ? Number(year.trim()) : null;

      // If the user picked a new cover, upload it first so the row update
      // can reference the new path. We keep the old path around to delete
      // once the row is safely repointed.
      let imageUpdate: {
        image_path: string;
        image_width: number | null;
        image_height: number | null;
        color_hex: string | null;
        color_hue: number | null;
      } | null = null;
      let oldPathToDelete: string | null = null;
      if (pendingImage) {
        assertSupabaseConfigured();
        const ext = fileExtension(pendingImage.file);
        const path = `${new Date().toISOString().slice(0, 10)}/${randomId()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, pendingImage.file, {
            cacheControl: "31536000",
            upsert: false,
            contentType: pendingImage.file.type || undefined,
          });
        if (uploadErr) throw uploadErr;
        imageUpdate = {
          image_path: path,
          image_width: pendingImage.probed?.width ?? null,
          image_height: pendingImage.probed?.height ?? null,
          color_hex: pendingImage.probed?.colorHex ?? null,
          color_hue: pendingImage.probed?.colorHue ?? null,
        };
        oldPathToDelete = initial.image_path;
      }

      const { error: updErr } = await supabase
        .from("refs")
        .update({
          title: title.trim() || null,
          year: yearNum,
          source_url: sourceUrl.trim() || null,
          genres,
          medium: medium === NONE ? null : medium,
          languages,
          tags,
          ocr_text: ocrText.trim() || null,
          ...(imageUpdate ?? {}),
          // Stale embedding now that the cover changed; force re-compute.
          ...(imageUpdate ? { embedding: null } : {}),
        })
        .eq("id", refId);
      if (updErr) throw updErr;

      // Best-effort cleanup + re-embed once the row is updated. Failures
      // here don't roll back the edit — the user already saved their work.
      if (oldPathToDelete && oldPathToDelete !== imageUpdate?.image_path) {
        void supabase.storage
          .from(STORAGE_BUCKET)
          .remove([oldPathToDelete])
          .catch(() => {});
      }
      if (imageUpdate) {
        void fetch("/api/embed-ref", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: refId }),
          keepalive: true,
        }).catch(() => {});
      }

      // Reset designer links: delete all then insert current selection.
      const { error: delErr } = await supabase
        .from("ref_designers")
        .delete()
        .eq("ref_id", refId);
      if (delErr) throw delErr;

      if (designers.length > 0) {
        const rows = designers.map((d) => ({ ref_id: refId, designer_id: d.id }));
        const { error: linkErr } = await supabase
          .from("ref_designers")
          .insert(rows);
        if (linkErr) throw linkErr;
      }

      window.location.assign(`/ref/${refId}`);
    } catch (err) {
      console.error("ref update failed", err);
      setError(extractErrorMessage(err));
      setSubmitting(false);
    }
  }

  const previewWidth =
    pendingImage?.probed?.width ?? initial.image_width ?? 4;
  const previewHeight =
    pendingImage?.probed?.height ?? initial.image_height ?? 5;
  const currentSrc = pendingImage
    ? pendingImage.previewUrl
    : publicImageUrl(initial.image_path);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          이미지
        </Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div
            className="relative w-40 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
            style={{ aspectRatio: `${previewWidth} / ${previewHeight}` }}
          >
            {pendingImage ? (
              // Local object URL — Next/Image isn't worth the dance here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentSrc}
                alt="새 이미지 미리보기"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <Image
                src={currentSrc}
                alt={title || "현재 이미지"}
                fill
                sizes="160px"
                className="object-cover"
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickFile(file);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="size-3.5" />
                {pendingImage ? "다시 고르기" : "이미지 변경"}
              </Button>
              {pendingImage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearPending}
                >
                  <RotateCcw className="size-3.5" />
                  되돌리기
                </Button>
              ) : null}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {pendingImage
                ? `새 파일 — ${pendingImage.probed?.width ?? "?"}×${pendingImage.probed?.height ?? "?"}. 저장 시 기존 이미지를 교체하고 임베딩을 다시 계산합니다.`
                : "교체하면 색상·임베딩(시각 유사도)도 자동 재계산돼요."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="제목">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="연도">
          <Input
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            maxLength={4}
            placeholder="예: 2024"
            list="ck-year-options"
          />
          <datalist id="ck-year-options">
            {Array.from({ length: 60 }, (_, i) => {
              const y = new Date().getFullYear() - i;
              return <option key={y} value={String(y)} />;
            })}
          </datalist>
        </Field>
        <Field label="출처 URL" full>
          <Input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            inputMode="url"
            placeholder="https://"
          />
        </Field>
        <Field label="장르">
          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((g) => {
              const active = genres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() =>
                    setGenres(
                      active
                        ? genres.filter((x) => x !== g)
                        : [...genres, g],
                    )
                  }
                  className={`rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="매체">
          <Select value={medium} onValueChange={(v) => setMedium(v as Medium | typeof NONE)}>
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {MEDIUMS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="언어" full>
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.map((lang) => {
              const on = languages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className={`rounded-md border px-2 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="태그 (콤마 구분)" full>
          <div className="flex flex-col gap-2">
            <TagPresets tagsText={tagsText} onChange={setTagsText} />
            <Textarea
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              rows={2}
            />
          </div>
        </Field>
        <Field label="디자이너" full>
          <DesignerPicker selected={designers} onChange={setDesigners} />
        </Field>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? "저장 중…" : "저장"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2 ${full ? "md:col-span-2" : ""}`}>
      <Label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
