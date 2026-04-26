"use client";

import { useState } from "react";

import { DesignerPicker, type DesignerLite } from "./DesignerPicker";
import { DropZone, type UploadFile } from "./DropZone";
import { NicknamePill } from "@/components/nickname-pill";
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
import { useNickname } from "@/lib/nickname";
import { parseTags } from "@/lib/slug";
import { STORAGE_BUCKET, assertSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import {
  GENRES,
  LANGUAGES,
  MEDIUMS,
  type Genre,
  type Language,
  type Medium,
} from "@/lib/types";

const NONE = "__none__";

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

// Supabase가 던지는 PostgrestError/StorageError는 Error 인스턴스가 아닐 때가
// 있어서 `instanceof Error` 만으로는 메시지를 못 잡는다. 가능한 모든 형태에서
// 사람이 읽을 수 있는 문자열을 뽑아낸다.
function extractErrorMessage(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      error?: unknown;
      details?: unknown;
      hint?: unknown;
      statusCode?: unknown;
    };
    const parts = [e.message, e.details, e.hint, e.error]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (parts.length > 0) {
      const code = typeof e.statusCode === "string" || typeof e.statusCode === "number"
        ? ` (${e.statusCode})`
        : "";
      return parts.join(" — ") + code;
    }
  }
  return "업로드에 실패했습니다.";
}

export function MetadataForm() {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [genre, setGenre] = useState<Genre | typeof NONE>(NONE);
  const [medium, setMedium] = useState<Medium | typeof NONE>(NONE);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [tagsText, setTagsText] = useState("");
  const [designers, setDesigners] = useState<DesignerLite[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleLanguage(lang: Language) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hydrated) return;
    if (!nickname) {
      setError("먼저 /gate에서 닉네임을 등록해주세요.");
      return;
    }
    if (files.length === 0) {
      setError("이미지를 한 장 이상 추가해주세요.");
      return;
    }
    try {
      assertSupabaseConfigured();
    } catch (err) {
      setError(extractErrorMessage(err));
      return;
    }

    setSubmitting(true);
    const tags = parseTags(tagsText);
    const baseTitle = title.trim() || null;
    const yearNum = year.trim() ? Number(year.trim()) : null;
    const numbered = files.length > 1;

    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`업로드 중 ${i + 1}/${files.length} — ${f.file.name}`);

        const ext = fileExtension(f.file);
        const path = `${new Date().toISOString().slice(0, 10)}/${randomId()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, f.file, {
            cacheControl: "31536000",
            upsert: false,
            contentType: f.file.type || undefined,
          });
        if (uploadErr) throw uploadErr;

        const insertTitle = numbered && baseTitle
          ? `${baseTitle} (${i + 1})`
          : baseTitle;

        const { data: refRow, error: insertErr } = await supabase
          .from("refs")
          .insert({
            title: insertTitle,
            year: yearNum,
            source_url: sourceUrl.trim() || null,
            image_path: path,
            image_width: f.width ?? null,
            image_height: f.height ?? null,
            genre: genre === NONE ? null : genre,
            medium: medium === NONE ? null : medium,
            languages,
            tags,
            created_by: nickname,
          })
          .select("id")
          .single();
        if (insertErr) throw insertErr;

        if (designers.length > 0) {
          const rows = designers.map((d) => ({
            ref_id: (refRow as { id: string }).id,
            designer_id: d.id,
          }));
          const { error: linkErr } = await supabase
            .from("ref_designers")
            .insert(rows);
          if (linkErr) throw linkErr;
        }
      }

      setProgress("완료. 인덱스로 이동합니다.");
      // Full reload so the newly-inserted ref shows up in the index RSC and
      // we don't fight the router cache.
      window.location.assign("/");
    } catch (err) {
      console.error("upload failed", err);
      setError(extractErrorMessage(err));
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <DropZone files={files} onChange={setFiles} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="제목">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="여러 장이면 자동으로 (1), (2) 가 붙어요"
          />
        </Field>
        <Field label="연도">
          <Input
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            maxLength={4}
            placeholder="예: 2024"
          />
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
          <Select
            value={genre}
            onValueChange={(v) => setGenre(v as Genre | typeof NONE)}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {GENRES.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="매체">
          <Select
            value={medium}
            onValueChange={(v) => setMedium(v as Medium | typeof NONE)}
          >
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
          <Textarea
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="grid, swiss, riso, …"
            rows={2}
          />
        </Field>

        <Field label="디자이너" full>
          <DesignerPicker selected={designers} onChange={setDesigners} />
        </Field>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      {progress && !error ? (
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {progress}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        {nickname ? (
          <NicknamePill nickname={nickname} prefix="as @" />
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            /gate에서 닉네임 등록 필요
          </p>
        )}
        <Button type="submit" disabled={submitting || !hydrated}>
          {submitting ? "올리는 중…" : `${files.length || ""} 이미지 등록`}
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
