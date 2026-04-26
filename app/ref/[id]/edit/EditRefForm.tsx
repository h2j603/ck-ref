"use client";

import { useState } from "react";

import { DesignerPicker, type DesignerLite } from "@/components/upload/DesignerPicker";
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

type Initial = {
  title: string | null;
  year: number | null;
  source_url: string | null;
  genre: Genre | null;
  medium: Medium | null;
  languages: Language[];
  tags: string[];
  designers: DesignerLite[];
};

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
  const [genre, setGenre] = useState<Genre | typeof NONE>(initial.genre ?? NONE);
  const [medium, setMedium] = useState<Medium | typeof NONE>(initial.medium ?? NONE);
  const [languages, setLanguages] = useState<Language[]>(initial.languages);
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [designers, setDesigners] = useState<DesignerLite[]>(initial.designers);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tags = parseTags(tagsText);
      const yearNum = year.trim() ? Number(year.trim()) : null;

      const { error: updErr } = await supabase
        .from("refs")
        .update({
          title: title.trim() || null,
          year: yearNum,
          source_url: sourceUrl.trim() || null,
          genre: genre === NONE ? null : genre,
          medium: medium === NONE ? null : medium,
          languages,
          tags,
        })
        .eq("id", refId);
      if (updErr) throw updErr;

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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
          <Select value={genre} onValueChange={(v) => setGenre(v as Genre | typeof NONE)}>
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
          <Textarea
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            rows={2}
          />
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
