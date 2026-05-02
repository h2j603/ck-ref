"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { DesignerPicker, type DesignerLite } from "./DesignerPicker";
import { DropZone, type UploadFile } from "./DropZone";
import { TagPresets } from "./TagPresets";
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
import { probeImage } from "@/lib/imageProbe";
import { useNickname } from "@/lib/nickname";
import { runOCR } from "@/lib/ocr";
import { parseTags } from "@/lib/slug";
import { randomStoragePath } from "@/lib/storage";
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
  const [genres, setGenres] = useState<Genre[]>([]);
  const [medium, setMedium] = useState<Medium | typeof NONE>(NONE);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [tagsText, setTagsText] = useState("");
  const [designers, setDesigners] = useState<DesignerLite[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Kick off OCR for every newly-added file (ocrText === undefined). We
  // use a functional setState so concurrent OCR completions don't clobber
  // each other. If the user removes a file mid-recognize the result is
  // simply discarded by the setter's id check.
  useEffect(() => {
    const pending = files.filter((f) => f.ocrText === undefined);
    if (pending.length === 0) return;
    let cancelled = false;
    for (const f of pending) {
      // Video files have no readable text; resolve immediately with an
      // empty string so the OCR badge never spins forever. queueMicrotask
      // pushes the setState out of the effect body so the lint rule
      // against synchronous setState-in-effect doesn't trip.
      if (f.file.type.startsWith("video/")) {
        queueMicrotask(() => {
          if (cancelled) return;
          setFiles((prev) =>
            prev.map((p) => (p.id === f.id ? { ...p, ocrText: "" } : p)),
          );
        });
        continue;
      }
      void runOCR(f.file).then((text) => {
        if (cancelled) return;
        setFiles((prev) =>
          prev.map((p) => (p.id === f.id ? { ...p, ocrText: text } : p)),
        );
      });
    }
    return () => {
      cancelled = true;
    };
  }, [files]);

  async function importFromUrl() {
    const url = sourceUrl.trim();
    if (!url) {
      setImportError("URL을 먼저 입력해주세요.");
      return;
    }
    setImportError(null);
    setImporting(true);
    try {
      const ogRes = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
      const og = (await ogRes.json()) as {
        image?: string | null;
        images?: { url: string; is_video?: boolean }[] | null;
        title?: string | null;
        sourceUrl?: string;
        error?: string;
      };
      if (!ogRes.ok || !og.image) {
        throw new Error(og.error ?? "이미지를 찾지 못했어요.");
      }
      // Carousel posts return the full slide list under `images`. Pull
      // every slide so the user lands in DropZone with all of them and
      // can drop the ones they don't want before submitting. For video
      // slides Instagram returns the still poster as display_url —
      // we import it like any other image and prefix the filename with
      // "video-" so the user knows the moving frames weren't captured.
      const targets: { url: string; is_video?: boolean }[] =
        og.images && og.images.length > 0
          ? og.images
          : [{ url: og.image }];

      const fetched: UploadFile[] = [];
      const failures: string[] = [];
      let videoSlideCount = 0;
      for (let i = 0; i < targets.length; i += 1) {
        const slide = targets[i];
        if (slide.is_video) videoSlideCount += 1;
        try {
          const imgRes = await fetch(
            `/api/og/image?url=${encodeURIComponent(slide.url)}`,
          );
          if (!imgRes.ok) {
            const data = (await imgRes.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(data?.error ?? `slide ${i + 1}`);
          }
          const blob = await imgRes.blob();
          // Trust the server's content-type — image/* for stills,
          // video/mp4 for Reels / video carousel slides.
          const ct =
            blob.type ||
            (slide.is_video ? "video/mp4" : "image/jpeg");
          let ext = ct.split("/")[1]?.split(";")[0] || "bin";
          if (ext === "quicktime") ext = "mov";
          const prefix = slide.is_video ? "video" : "imported";
          const name = `${prefix}-${Date.now()}-${i + 1}.${ext}`;
          const file = new File([blob], name, { type: ct });
          const probed = await probeImage(file);
          fetched.push({
            id: `imported-${Date.now()}-${i}`,
            file,
            previewUrl: URL.createObjectURL(file),
            width: probed?.width,
            height: probed?.height,
            colorHex: probed?.colorHex ?? null,
            colorHue: probed?.colorHue ?? null,
          });
        } catch (slideErr) {
          failures.push(
            `${i + 1}: ${slideErr instanceof Error ? slideErr.message : "실패"}`,
          );
        }
      }

      if (fetched.length === 0) {
        throw new Error(
          failures.length > 0
            ? `슬라이드 가져오기 실패 — ${failures.join(", ")}`
            : "이미지를 받아오지 못했어요.",
        );
      }

      setFiles((prev) => [...prev, ...fetched]);
      if (!title.trim() && og.title) setTitle(og.title);
      if (og.sourceUrl) setSourceUrl(og.sourceUrl);
      const notes: string[] = [];
      if (failures.length > 0) {
        notes.push(`못 가져온 슬라이드 ${failures.length}장`);
      }
      if (videoSlideCount > 0) {
        notes.push(`비디오 ${videoSlideCount}장 포함`);
      }
      if (notes.length > 0) setImportError(notes.join(" · "));
    } catch (err) {
      setImportError(extractErrorMessage(err));
    } finally {
      setImporting(false);
    }
  }

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
    const refTitle = title.trim() || null;
    const yearNum = year.trim() ? Number(year.trim()) : null;

    try {
      // Upload all files first; only after they're all in storage do we
      // insert one ref + extras so we don't half-create on a mid-stream
      // failure.
      const uploaded: {
        path: string;
        width: number | null;
        height: number | null;
        colorHex: string | null;
        colorHue: number | null;
        ocrText: string | null;
      }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`업로드 중 ${i + 1}/${files.length} — ${f.file.name}`);
        const path = randomStoragePath(f.file);
        const { error: uploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, f.file, {
            cacheControl: "31536000",
            upsert: false,
            contentType: f.file.type || undefined,
          });
        if (uploadErr) throw uploadErr;
        uploaded.push({
          path,
          width: f.width ?? null,
          height: f.height ?? null,
          colorHex: f.colorHex ?? null,
          colorHue: f.colorHue ?? null,
          // Cover's OCR — if still recognising at submit time, save NULL
          // (search just won't match it; user can re-run from edit page).
          ocrText: f.ocrText && f.ocrText.length > 0 ? f.ocrText : null,
        });
      }

      // Cover = first file. The ref carries its dimensions and dominant
      // color so existing index/filter logic keeps working unchanged.
      const cover = uploaded[0];
      setProgress("ref 등록 중…");
      const { data: refRow, error: insertErr } = await supabase
        .from("refs")
        .insert({
          title: refTitle,
          year: yearNum,
          source_url: sourceUrl.trim() || null,
          image_path: cover.path,
          image_width: cover.width,
          image_height: cover.height,
          color_hex: cover.colorHex,
          color_hue: cover.colorHue,
          ocr_text: cover.ocrText,
          genres,
          medium: medium === NONE ? null : medium,
          languages,
          tags,
          created_by: nickname,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      const refId = (refRow as { id: string }).id;

      if (uploaded.length > 1) {
        const extras = uploaded.slice(1).map((u, i) => ({
          ref_id: refId,
          image_path: u.path,
          image_width: u.width,
          image_height: u.height,
          position: i,
        }));
        const { error: extrasErr } = await supabase
          .from("ref_images")
          .insert(extras);
        if (extrasErr) throw extrasErr;
      }

      if (designers.length > 0) {
        const rows = designers.map((d) => ({
          ref_id: refId,
          designer_id: d.id,
        }));
        const { error: linkErr } = await supabase
          .from("ref_designers")
          .insert(rows);
        if (linkErr) throw linkErr;
      }

      // Kick off image-embedding compute in the background. Skip for
      // videos — CLIP doesn't take an mp4 and the provider would just
      // return a 4xx. The reranker handles missing embeddings.
      if (!files[0]?.file.type.startsWith("video/")) {
        void fetch("/api/embed-ref", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: refId }),
          keepalive: true,
        }).catch(() => {});
      }

      setProgress("완료. 인덱스로 이동합니다.");
      // Full reload so the newly-inserted ref shows up in the index RSC and
      // we don't fight the router cache. The unique query param defeats
      // iOS Safari's disk cache, which was serving the pre-upload HTML
      // back to us even though the route is fully dynamic.
      window.location.replace(`/?u=${Date.now()}`);
    } catch (err) {
      console.error("upload failed", err);
      setError(extractErrorMessage(err));
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <DropZone
        files={files}
        onChange={setFiles}
        genre={genres.includes("web") ? "web" : null}
        onUrlFetched={({ url, title: ogTitle }) => {
          setSourceUrl(url);
          if (ogTitle && !title.trim()) setTitle(ogTitle);
        }}
      />

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
          <div className="flex flex-col gap-1.5">
            <div className="flex items-stretch gap-2">
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                inputMode="url"
                placeholder="https://"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={importFromUrl}
                disabled={importing || !sourceUrl.trim()}
                className="shrink-0"
              >
                <Download className="size-3.5" />
                {importing ? "가져오는 중…" : "가져오기"}
              </Button>
            </div>
            {importError ? (
              <p className="text-xs text-destructive">{importError}</p>
            ) : (
              <p className="font-mono text-[10px] text-muted-foreground">
                URL의 og:image / 제목을 자동으로 채워요. 인스타는 게시물에 따라 실패할 수 있어요.
              </p>
            )}
          </div>
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
          <div className="flex flex-col gap-2">
            <TagPresets tagsText={tagsText} onChange={setTagsText} />
            <Textarea
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="grid, swiss, riso, …"
              rows={2}
            />
          </div>
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
          <NicknamePill nickname={nickname} prefix="as @" link={false} />
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
