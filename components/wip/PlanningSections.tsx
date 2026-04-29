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
  PLANNING_SECTIONS,
  type PlanningSection,
  type ProjectPlanning,
} from "@/lib/types";

type SectionMeta = {
  label: string;
  placeholder: string;
  rows: number;
  short?: boolean;
};

const SECTION_META: Record<Exclude<PlanningSection, "tone">, SectionMeta> = {
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

const TEXT_SECTIONS = (
  PLANNING_SECTIONS.filter((s) => s !== "tone") as Exclude<
    PlanningSection,
    "tone"
  >[]
);

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
        {TEXT_SECTIONS.map((key) => (
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
        <div className="md:col-span-2">
          <ToneSection
            value={planning.tone ?? []}
            canEdit={canEdit}
            onSave={(tone) => persist({ ...planning, tone: tone.length ? tone : undefined })}
          />
        </div>
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
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={!canEdit}
          className="rounded-md border border-dashed border-border/60 p-3 text-left font-mono text-[11px] text-muted-foreground hover:border-border disabled:cursor-default"
        >
          {canEdit ? meta.placeholder : "—"}
        </button>
      )}
    </div>
  );
}

function ToneSection({
  value,
  canEdit,
  onSave,
}: {
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

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        톤 & 무드 키워드
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && !canEdit ? (
          <p className="font-mono text-[11px] text-muted-foreground">—</p>
        ) : null}
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-input bg-muted/40 px-2 py-0.5 text-[12px]"
          >
            {tag}
            {canEdit ? (
              <button
                type="button"
                onClick={() => void remove(tag)}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
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
              placeholder="warm, gritty, lo-fi…"
              className="h-7 w-32 text-[12px]"
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
