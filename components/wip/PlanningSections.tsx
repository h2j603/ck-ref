"use client";

import { Crown, Flag, Pencil, Plus, X } from "lucide-react";
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
import { relativeTime } from "@/lib/relativeTime";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  PLANNING_TEXT_SECTIONS,
  type CalendarEvent,
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
  initialUpdatedAt,
  initialUpdatedBy,
  initialMilestones,
}: {
  projectId: string;
  createdBy: string | null;
  initial: ProjectPlanning;
  profiles: Profile[];
  initialUpdatedAt: string | null;
  initialUpdatedBy: string | null;
  initialMilestones: CalendarEvent[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const [planning, setPlanning] = useState<ProjectPlanning>(initial);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [updatedBy, setUpdatedBy] = useState<string | null>(initialUpdatedBy);
  const [milestones, setMilestones] =
    useState<CalendarEvent[]>(initialMilestones);
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
    (planning.roles && planning.roles.length > 0) ||
    milestones.length > 0;
  if (!canEdit && !hasContent) return null;

  async function persist(next: ProjectPlanning) {
    setError(null);
    const previousPlanning = planning;
    const previousAt = updatedAt;
    const previousBy = updatedBy;
    const nowIso = new Date().toISOString();
    const author = nickname || null;
    setPlanning(next);
    setUpdatedAt(nowIso);
    setUpdatedBy(author);
    const { error } = await supabase
      .from("projects")
      .update({
        planning: next,
        planning_updated_at: nowIso,
        planning_updated_by: author,
      })
      .eq("id", projectId);
    if (error) {
      setError(error.message);
      setPlanning(previousPlanning);
      setUpdatedAt(previousAt);
      setUpdatedBy(previousBy);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          기획
        </h2>
        {updatedAt ? (
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {updatedBy ? <NicknamePill nickname={updatedBy} link={false} /> : null}
            <span>· {relativeTime(updatedAt)} 수정</span>
          </p>
        ) : null}
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
        {canEdit || milestones.length > 0 ? (
          <div className="md:col-span-2">
            <MilestonesSection
              projectId={projectId}
              canEdit={canEdit}
              author={nickname}
              value={milestones}
              onChange={setMilestones}
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

// Shared row dimensions used by every "row + form" planning section so
// roles, milestones, etc. line up vertically — same horizontal padding,
// same height, same right-anchored actions slot. Each section fills the
// content area with its own grid/flex internally.
const ROW_SHELL =
  "flex items-center gap-2 rounded-md border px-3 py-1.5";
// Fixed-width slot for trailing buttons. Forms' 등록 fills it, displayed
// rows' icons (× / crown) right-align inside it. This is what makes the
// 등록 button column line up across sections.
const ROW_ACTIONS = "flex w-16 shrink-0 items-center justify-end gap-1.5";

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

  // Three-column grid for the inner content: person pill (fixed) | sep | role.
  // Displayed rows live inside ROW_SHELL's px-3, so their content starts
  // 0.75rem in from the section's left edge. The form uses pl-0 so its
  // input starts flush with the header — to keep the `|` separator at the
  // same x across rows and form, the form's first column is widened by
  // exactly that 0.75rem to absorb the missing left padding.
  const ROW_CONTENT_GRID =
    "flex-1 min-w-0 grid grid-cols-[4rem_auto_1fr] items-center gap-2";
  const FORM_CONTENT_GRID =
    "flex-1 min-w-0 grid grid-cols-[4.75rem_auto_1fr] items-center gap-2";

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
              className={cn(ROW_SHELL, "border-border/60 bg-muted/20")}
              onDoubleClick={() => {
                if (canEdit) void toggleLeader(i);
              }}
              title={canEdit ? "더블클릭으로 리더 설정/해제" : undefined}
            >
              <div className={ROW_CONTENT_GRID}>
                <div className="min-w-0 truncate">
                  <NicknamePill nickname={r.person} link={false} />
                </div>
                <span className="text-muted-foreground">|</span>
                <span className="min-w-0 truncate text-sm">{r.role}</span>
              </div>
              <div className={ROW_ACTIONS}>
                {r.is_leader ? (
                  <span
                    className="text-lime-600 dark:text-lime-400"
                    title="프로젝트 리더"
                    aria-label="프로젝트 리더"
                  >
                    <Crown className="size-3.5" fill="currentColor" />
                  </span>
                ) : null}
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
                ) : null}
              </div>
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
          className={cn(ROW_SHELL, "border-transparent bg-transparent pl-0")}
        >
          <div className={FORM_CONTENT_GRID}>
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
          </div>
          <div className={ROW_ACTIONS}>
            <Button
              type="submit"
              size="sm"
              className="h-8 w-full text-xs"
              disabled={busy}
            >
              등록
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function MilestonesSection({
  projectId,
  canEdit,
  author,
  value,
  onChange,
}: {
  projectId: string;
  canEdit: boolean;
  author: string | null;
  value: CalendarEvent[];
  onChange: (next: CalendarEvent[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const title = draftTitle.trim();
    const date = draftDate.trim();
    if (!title || !date) return;
    setError(null);
    setBusy(true);
    // Store as midnight UTC on the picked date so the calendar's all_day
    // rendering picks it up cleanly. Calendar uses starts_at as the
    // local-midnight reference.
    const startsAt = new Date(`${date}T00:00:00Z`).toISOString();
    const { data, error } = await supabase
      .from("events")
      .insert({
        project_id: projectId,
        title,
        starts_at: startsAt,
        all_day: true,
        kind: "milestone",
        created_by: author,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "마일스톤 생성 실패");
      return;
    }
    const row = data as CalendarEvent;
    onChange(
      [...value, row].sort((a, b) =>
        a.starts_at.localeCompare(b.starts_at),
      ),
    );
    setDraftTitle("");
    setDraftDate("");
  }

  async function remove(id: string) {
    setError(null);
    setBusy(true);
    const { error } = await supabase.from("events").delete().eq("id", id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onChange(value.filter((e) => e.id !== id));
  }

  function dateLabel(iso: string) {
    return new Date(iso).toLocaleDateString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
    });
  }

  // Inner content: Flag glyph + title (flex-1) + fixed-width date column.
  // Date stays on the right of the content area; the action button lives
  // outside in ROW_ACTIONS so it lines up with roles' 등록 button.
  const CONTENT_FLEX =
    "flex-1 min-w-0 flex items-center gap-2";

  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        <Flag className="size-3" />
        마일스톤
        <span className="ml-1 normal-case tracking-normal text-[10px] text-muted-foreground/80">
          — 캘린더에도 자동 노출
        </span>
      </h3>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {value.length === 0 && !canEdit ? null : (
        <ul className="flex flex-col gap-1.5">
          {value.map((m) => (
            <li
              key={m.id}
              className={cn(
                ROW_SHELL,
                "border-border/60 bg-muted/20",
              )}
            >
              <div className={CONTENT_FLEX}>
                <Flag className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {dateLabel(m.starts_at)}
                </span>
              </div>
              <div className={ROW_ACTIONS}>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => void remove(m.id)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="remove"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
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
          className={cn(ROW_SHELL, "border-transparent bg-transparent pl-0")}
        >
          <div className={CONTENT_FLEX}>
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="마일스톤 (예: 시안 1차)"
              className="h-8 flex-1 text-[12px]"
              disabled={busy}
            />
            <Input
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className="h-8 w-32 shrink-0 text-[12px]"
              disabled={busy}
            />
          </div>
          <div className={ROW_ACTIONS}>
            <Button
              type="submit"
              size="sm"
              className="h-8 w-full text-xs"
              disabled={busy}
            >
              등록
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

