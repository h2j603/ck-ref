"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { MarkdownWithMentions } from "@/components/mentioned-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";
import {
  PLANNING_TEXT_SECTIONS,
  type PlanningTextSection,
  type ProjectPlanning,
} from "@/lib/types";

type SectionMeta = {
  label: string;
  placeholder: string;
  rows: number;
  short?: boolean;
};

const SECTION_META: Record<PlanningTextSection, SectionMeta> = {
  concept: {
    label: "한 줄 컨셉",
    placeholder: "이 프로젝트를 한 문장으로",
    rows: 2,
    short: true,
  },
  problem: {
    label: "문제 / 동기",
    placeholder: "왜 만드는가, 어떤 갈증이 있는가",
    rows: 4,
  },
  audience: {
    label: "타겟 / 페르소나",
    placeholder: "누구를 위해. 데모/사이코그래픽, 컨텍스트",
    rows: 4,
  },
  constraints: {
    label: "제약 / 일정",
    placeholder: "마감, 매체, 포맷, 예산, 기술적 제약",
    rows: 3,
  },
  deliverables: {
    label: "산출물",
    placeholder: "무엇을 만들 것인가 — 포맷, 사이즈, 개수",
    rows: 3,
  },
};

export function PlanningSections({
  projectId,
  createdBy,
  initial,
}: {
  projectId: string;
  createdBy: string | null;
  initial: ProjectPlanning;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const [planning, setPlanning] = useState<ProjectPlanning>(initial);
  const [error, setError] = useState<string | null>(null);

  const canEdit = hydrated && nickname !== null && nickname === createdBy;

  // For viewers without edit rights, hide the whole block when there's
  // nothing to read — better than a row of dash placeholders.
  const hasContent =
    Boolean(planning.concept) ||
    Boolean(planning.problem) ||
    Boolean(planning.audience) ||
    Boolean(planning.constraints) ||
    Boolean(planning.deliverables) ||
    (planning.positive_keywords && planning.positive_keywords.length > 0) ||
    (planning.negative_keywords && planning.negative_keywords.length > 0);
  if (!canEdit && !hasContent) return null;

  async function persist(next: ProjectPlanning) {
    setError(null);
    const previous = planning;
    setPlanning(next);
    const { error } = await supabase
      .from("projects")
      .update({ planning: next })
      .eq("id", projectId);
    if (error) {
      setError(error.message);
      setPlanning(previous);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          기획
        </h2>
      </header>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        {PLANNING_TEXT_SECTIONS.filter(
          (key) => canEdit || (planning[key] ?? "").length > 0,
        ).map((key) => (
          <div
            key={key}
            className={SECTION_META[key].short ? "md:col-span-2" : undefined}
          >
            <TextSection
              meta={SECTION_META[key]}
              value={planning[key] ?? ""}
              canEdit={canEdit}
              onSave={(v) => persist({ ...planning, [key]: v || undefined })}
            />
          </div>
        ))}
        {canEdit ||
        (planning.positive_keywords &&
          planning.positive_keywords.length > 0) ? (
          <KeywordSection
            label="포지티브 키워드"
            hint="가져가고 싶은 분위기 — warm, gritty, lo-fi…"
            tone="positive"
            value={planning.positive_keywords ?? []}
            canEdit={canEdit}
            onSave={(next) =>
              persist({
                ...planning,
                positive_keywords: next.length ? next : undefined,
              })
            }
          />
        ) : null}
        {canEdit ||
        (planning.negative_keywords &&
          planning.negative_keywords.length > 0) ? (
          <KeywordSection
            label="네거티브 키워드"
            hint="피하고 싶은 분위기 — cute, glossy, corporate…"
            tone="negative"
            value={planning.negative_keywords ?? []}
            canEdit={canEdit}
            onSave={(next) =>
              persist({
                ...planning,
                negative_keywords: next.length ? next : undefined,
              })
            }
          />
        ) : null}
      </div>
    </section>
  );
}

function TextSection({
  meta,
  value,
  canEdit,
  onSave,
}: {
  meta: SectionMeta;
  value: string;
  canEdit: boolean;
  onSave: (next: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  function start() {
    if (!canEdit) return;
    setDraft(value);
    setEditing(true);
  }
  async function save() {
    setBusy(true);
    await onSave(draft.trim());
    setBusy(false);
    setEditing(false);
  }

  // Read-only viewers don't need a label for an empty section — hide it
  // entirely so the parent grid collapses cleanly.
  if (!canEdit && !value) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {meta.label}
        </h3>
        {canEdit && !editing ? (
          <button
            type="button"
            onClick={start}
            className="text-muted-foreground hover:text-foreground"
            aria-label="edit"
          >
            <Pencil className="size-3" />
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          {meta.short ? (
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={meta.placeholder}
              autoFocus
              disabled={busy}
            />
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={meta.rows}
              placeholder={meta.placeholder}
              autoFocus
              disabled={busy}
            />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => void save()}
              disabled={busy}
            >
              {busy ? "저장…" : "저장"}
            </Button>
          </div>
        </div>
      ) : value ? (
        <div
          className={
            canEdit
              ? "prose prose-sm prose-neutral max-w-none cursor-text rounded-md border border-transparent p-2 text-foreground hover:border-border"
              : "prose prose-sm prose-neutral max-w-none p-2 text-foreground"
          }
          onClick={start}
        >
          <MarkdownWithMentions text={value} />
        </div>
      ) : canEdit ? (
        <button
          type="button"
          onClick={start}
          className="rounded-md border border-dashed border-border/60 p-3 text-left font-mono text-[11px] text-muted-foreground hover:border-border"
        >
          {meta.placeholder}
        </button>
      ) : null}
    </div>
  );
}

function KeywordSection({
  label,
  hint,
  tone,
  value,
  canEdit,
  onSave,
}: {
  label: string;
  hint: string;
  tone: "positive" | "negative";
  value: string[];
  canEdit: boolean;
  onSave: (next: string[]) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const next = draft.trim();
    if (!next || value.includes(next)) {
      setDraft("");
      return;
    }
    setBusy(true);
    await onSave([...value, next]);
    setBusy(false);
    setDraft("");
  }
  async function remove(tag: string) {
    setBusy(true);
    await onSave(value.filter((t) => t !== tag));
    setBusy(false);
  }

  // Greens/reds for positive/negative so the two columns are distinguishable
  // at a glance without resorting to icons that fight the rest of the UI.
  const chipClass =
    tone === "positive"
      ? "border-emerald-300/60 bg-emerald-50/60 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100"
      : "border-rose-300/60 bg-rose-50/60 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100";

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] ${chipClass}`}
          >
            {tag}
            {canEdit ? (
              <button
                type="button"
                onClick={() => void remove(tag)}
                disabled={busy}
                className="opacity-70 hover:opacity-100"
                aria-label={`remove ${tag}`}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
        {canEdit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
            className="inline-flex items-center gap-1"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={hint}
              className="h-7 w-40 text-[12px]"
              disabled={busy}
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={busy || draft.trim().length === 0}
            >
              <Plus className="size-3" />
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
