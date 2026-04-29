"use client";

import { Crown, Pencil, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { MarkdownWithMentions } from "@/components/mentioned-text";
import { NicknamePill } from "@/components/nickname-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import type { Profile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  PLANNING_TEXT_SECTIONS,
  type PlanningTextSection,
  type ProjectPlanning,
  type ProjectRole,
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
  profiles,
}: {
  projectId: string;
  createdBy: string | null;
  initial: ProjectPlanning;
  profiles: Profile[];
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
    (planning.negative_keywords && planning.negative_keywords.length > 0) ||
    (planning.roles && planning.roles.length > 0);
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
        {canEdit || (planning.roles && planning.roles.length > 0) ? (
          <div className="md:col-span-2">
            <RolesSection
              value={planning.roles ?? []}
              canEdit={canEdit}
              profiles={profiles}
              onSave={(roles) =>
                persist({
                  ...planning,
                  roles: roles.length ? roles : undefined,
                })
              }
            />
          </div>
        ) : null}
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

function RolesSection({
  value,
  canEdit,
  profiles,
  onSave,
}: {
  value: ProjectRole[];
  canEdit: boolean;
  profiles: Profile[];
  onSave: (next: ProjectRole[]) => Promise<void> | void;
}) {
  const [draftPerson, setDraftPerson] = useState("");
  const [draftRole, setDraftRole] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const role = draftRole.trim();
    if (!draftPerson || !role) return;
    setBusy(true);
    await onSave([...value, { person: draftPerson, role }]);
    setBusy(false);
    setDraftPerson("");
    setDraftRole("");
  }

  async function remove(index: number) {
    setBusy(true);
    await onSave(value.filter((_, i) => i !== index));
    setBusy(false);
  }

  // Toggle leader on the clicked row. Project leader is single-occupancy:
  // turning one on automatically turns the others off, so the crown badge
  // never lies about who's actually leading.
  async function toggleLeader(index: number) {
    setBusy(true);
    const target = !value[index].is_leader;
    await onSave(
      value.map((r, i) => ({
        ...r,
        is_leader: i === index ? target : false,
      })),
    );
    setBusy(false);
  }

  // The five-column grid keeps the | separators and trailing buttons in
  // the same x-position across rows regardless of nickname length.
  // Person column is fixed width (pill) so the role text always starts
  // at the same place.
  const ROW_GRID =
    "grid grid-cols-[5.5rem_auto_1fr_auto_auto] items-center gap-2";

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        역할 분담
      </h3>
      {value.length === 0 && !canEdit ? null : (
        <ul className="flex flex-col gap-1.5">
          {value.map((r, i) => (
            <li
              key={i}
              className={cn(
                ROW_GRID,
                "rounded-md border px-2 py-1",
                r.is_leader
                  ? "border-lime-300 bg-lime-50 dark:border-lime-500/40 dark:bg-lime-500/10"
                  : "border-border/60 bg-muted/20",
              )}
            >
              <div className="min-w-0 truncate">
                <NicknamePill nickname={r.person} link={false} />
              </div>
              <span className="text-muted-foreground">|</span>
              <span className="min-w-0 truncate text-sm">{r.role}</span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void toggleLeader(i)}
                  disabled={busy}
                  className={cn(
                    "transition-colors",
                    r.is_leader
                      ? "text-lime-600 hover:text-lime-700 dark:text-lime-400"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label={
                    r.is_leader ? "프로젝트 리더 해제" : "프로젝트 리더로 설정"
                  }
                  title={
                    r.is_leader
                      ? "프로젝트 리더 (클릭으로 해제)"
                      : "프로젝트 리더로 설정"
                  }
                >
                  <Crown
                    className="size-3.5"
                    fill={r.is_leader ? "currentColor" : "none"}
                  />
                </button>
              ) : r.is_leader ? (
                <span
                  className="text-lime-600 dark:text-lime-400"
                  title="프로젝트 리더"
                  aria-label="프로젝트 리더"
                >
                  <Crown className="size-3.5" fill="currentColor" />
                </span>
              ) : (
                <span aria-hidden />
              )}
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void remove(i)}
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="remove"
                >
                  <X className="size-3" />
                </button>
              ) : (
                <span aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className={cn(ROW_GRID, "px-2")}
        >
          <Select
            value={draftPerson}
            onValueChange={setDraftPerson}
            disabled={busy}
          >
            <SelectTrigger className="h-8 w-full text-[12px]">
              <SelectValue placeholder="인원" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  @{p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">|</span>
          <Input
            value={draftRole}
            onChange={(e) => setDraftRole(e.target.value)}
            placeholder="역할"
            className="h-8 w-full text-[12px]"
            disabled={busy}
          />
          {/* Empty cell to keep the leader column aligned with above rows. */}
          <span aria-hidden />
          <Button
            type="submit"
            size="sm"
            className="h-8 text-[11px]"
            disabled={busy || !draftPerson || draftRole.trim().length === 0}
          >
            등록
          </Button>
        </form>
      ) : null}
    </div>
  );
}

