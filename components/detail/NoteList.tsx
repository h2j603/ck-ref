"use client";

import {
  CheckCircle2,
  CircleHelp,
  CornerDownRight,
  ImagePlus,
  MessageCircle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MarkdownWithMentions } from "@/components/mentioned-text";
import { MentionInput } from "@/components/mention-input";
import { Input } from "@/components/ui/input";
import { NicknamePill } from "@/components/nickname-pill";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NoteImageStrip } from "@/components/detail/NoteImageStrip";
import { useNickname } from "@/lib/nickname";
import { FALLBACK_PROFILES, type Profile } from "@/lib/profiles";
import { STORAGE_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { NOTE_FACETS, type Note, type NoteFacet, type NoteKind, type NoteTarget } from "@/lib/types";

type SupabaseClient = ReturnType<typeof createClient>;

function fileExt(file: File): string {
  const dot = file.name.lastIndexOf(".");
  if (dot >= 0) return file.name.slice(dot + 1).toLowerCase();
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "bin";
}

function notePath(ext: string): string {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `notes/${stamp}-${rand}.${ext}`;
}

async function uploadAttachments(
  supabase: SupabaseClient,
  files: File[],
): Promise<string[]> {
  const paths: string[] = [];
  for (const f of files) {
    const path = notePath(fileExt(f));
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, f, {
        cacheControl: "31536000",
        upsert: false,
        contentType: f.type || undefined,
      });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

function targetColumn(target: NoteTarget): string {
  switch (target.kind) {
    case "ref":
      return "ref_id";
    case "project":
      return "project_id";
    case "project_update":
      return "project_update_id";
  }
}

function targetPayload(target: NoteTarget): Record<string, string | null> {
  return {
    ref_id: target.kind === "ref" ? target.id : null,
    project_id: target.kind === "project" ? target.id : null,
    project_update_id: target.kind === "project_update" ? target.id : null,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

type Draft = {
  body: string;
  pros: string;
  cons: string;
  facet: NoteFacet | null;
  // User-entered label when facet === "etc". Empty otherwise.
  facetLabel: string;
};
const EMPTY: Draft = {
  body: "",
  pros: "",
  cons: "",
  facet: null,
  facetLabel: "",
};

// Quick-fill chips for the formal-analysis facets — pasted into the
// note body when clicked so the writer doesn't have to type the
// vocabulary from scratch. The list isn't exhaustive; it's a starter
// kit for the most common observations our team makes. Grid-specific
// composition chips only show for poster / editorial — that's where
// the formal grid system actually applies.
const GRID_COMPOSITION_CHIPS = [
  "1단",
  "2단 그리드",
  "3단 그리드",
  "모듈러",
  "그리드 파괴",
];
const COMMON_COMPOSITION_CHIPS = [
  "비대칭",
  "가운데 정렬",
  "좌측 정렬",
  "넉넉한 여백",
  "꽉 찬 레이아웃",
];
function compositionPresets(gridApplicable: boolean): string[] {
  return gridApplicable
    ? [...GRID_COMPOSITION_CHIPS, ...COMMON_COMPOSITION_CHIPS]
    : COMMON_COMPOSITION_CHIPS;
}
const FACET_PRESETS: Record<"type" | "material", string[]> = {
  type: [
    "고대비",
    "단일 굵기",
    "다중 굵기",
    "세리프/산세리프 혼용",
    "전체 대문자",
    "와이드 트래킹",
    "좁은 행간",
    "모노스페이스",
    "적층",
    "큰 본문",
  ],
  material: [
    "사진 중심",
    "일러스트 중심",
    "텍스처/패턴",
    "리소그래프",
    "특수 인쇄 (포일/박)",
    "재료 노출 (종이결, 천 등)",
  ],
};

const FACET_LABEL: Record<NoteFacet, string> = {
  composition: "구성",
  type: "활자",
  material: "재료/이미지",
  // Generic catch-all — paired with note.facet_label for the actual
  // user-entered axis name. The chip in the picker shows "+ 기타" so
  // it reads as an "add custom" affordance.
  etc: "기타",
};

// Three "shapes" of note. Default `discussion` is the existing free-form
// thread; the other two surface in the project header summary so threads
// don't bury commitments and unanswered questions.
//
// Each kind has two looks:
//   - active: the picker's "selected" state, and the displayed badge
//   - inactive: the picker's unselected state (always the same outline)
// `discussion`'s active style has to differ from the shared inactive
// outline or the default chip looks dead — clicking it appears to do
// nothing because the visual is unchanged.
const INACTIVE_CHIP =
  "border-input text-muted-foreground hover:text-foreground";

const KIND_META: Record<
  NoteKind,
  { label: string; activeChip: string; Icon: typeof MessageCircle }
> = {
  discussion: {
    label: "논의",
    activeChip: "border-foreground bg-foreground text-background",
    Icon: MessageCircle,
  },
  decision: {
    label: "결정",
    activeChip:
      "border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
    Icon: CheckCircle2,
  },
  open_question: {
    label: "열린 질문",
    activeChip:
      "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
    Icon: CircleHelp,
  },
};

function trimToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

function noteToDraft(note: Note): Draft {
  return {
    body: note.body ?? "",
    pros: note.pros ?? "",
    cons: note.cons ?? "",
    facet: note.facet,
    facetLabel: note.facet_label ?? "",
  };
}

export function NoteList({
  target,
  initialNotes,
  profiles = FALLBACK_PROFILES,
  gridApplicable = false,
}: {
  target: NoteTarget;
  initialNotes: Note[];
  profiles?: Profile[];
  // When the parent ref's genres include "poster", expose the
  // grid-specific composition presets in the facet picker.
  gridApplicable?: boolean;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [draftKind, setDraftKind] = useState<NoteKind>("discussion");
  const [draftImages, setDraftImages] = useState<File[]>([]);
  // Kind chips (decision / open question) live on anything WIP-related —
  // project threads and per-update threads. Ref archive notes stay simple
  // since they're closer to comments than commitments.
  const showKinds = target.kind !== "ref";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft>(EMPTY);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyImages, setReplyImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Header summary — only render the chips that have at least one row,
  // so a fresh thread still looks clean.
  const kindCounts = useMemo(() => {
    const c = { decision: 0, open_question: 0 };
    for (const n of notes) {
      if (n.kind === "decision") c.decision += 1;
      else if (n.kind === "open_question") c.open_question += 1;
    }
    return c;
  }, [notes]);

  // Refetch on mount in case server data is stale. Pulls top-level notes
  // for this target plus any replies whose parent is in that set.
  useEffect(() => {
    let cancelled = false;
    const column = targetColumn(target);
    void (async () => {
      const top = await supabase
        .from("notes")
        .select("*")
        .eq(column, target.id)
        .order("created_at", { ascending: true });
      if (cancelled || top.error || !top.data) return;
      const rows = top.data as Note[];
      const ids = rows.map((n) => n.id);
      if (ids.length === 0) {
        setNotes([]);
        return;
      }
      const replies = await supabase
        .from("notes")
        .select("*")
        .in("parent_id", ids)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const merged = new Map<string, Note>();
      for (const n of rows) merged.set(n.id, n);
      if (!replies.error && replies.data) {
        for (const n of replies.data as Note[]) merged.set(n.id, n);
      }
      setNotes(
        [...merged.values()].sort((a, b) =>
          a.created_at.localeCompare(b.created_at),
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, target]);

  const { topLevel, repliesByParent } = useMemo(() => {
    const top: Note[] = [];
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      if (n.parent_id) {
        const list = map.get(n.parent_id) ?? [];
        list.push(n);
        map.set(n.parent_id, list);
      } else {
        top.push(n);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return { topLevel: top, repliesByParent: map };
  }, [notes]);

  const draftHasContent =
    draft.body.trim() !== "" ||
    draft.pros.trim() !== "" ||
    draft.cons.trim() !== "" ||
    draftImages.length > 0;

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nickname) {
      setError("/gate에서 닉네임을 먼저 등록해주세요.");
      return;
    }
    if (!draftHasContent) return;

    setBusy(true);
    let imagePaths: string[] = [];
    try {
      imagePaths = await uploadAttachments(supabase, draftImages);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "이미지 업로드 실패");
      return;
    }
    const { data, error } = await supabase
      .from("notes")
      .insert({
        ...targetPayload(target),
        parent_id: null,
        body: trimToNull(draft.body),
        pros: trimToNull(draft.pros),
        cons: trimToNull(draft.cons),
        image_paths: imagePaths,
        kind: draftKind,
        facet: target.kind === "ref" ? draft.facet : null,
        // Spread conditionally so the key is OMITTED when not needed.
        // Supabase rejects any insert that names a missing column even
        // with a null value, so this also covers envs that haven't run
        // the facet_label migration yet.
        ...(target.kind === "ref" && draft.facet === "etc"
          ? { facet_label: trimToNull(draft.facetLabel) }
          : {}),
        author: nickname,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) => [...prev, data as Note]);
    setDraft(EMPTY);
    setDraftKind("discussion");
    setDraftImages([]);
  }

  async function addReply(parentId: string) {
    setError(null);
    if (!nickname) {
      setError("/gate에서 닉네임을 먼저 등록해주세요.");
      return;
    }
    const body = replyDraft.trim();
    if (!body && replyImages.length === 0) return;

    setBusy(true);
    let imagePaths: string[] = [];
    try {
      imagePaths = await uploadAttachments(supabase, replyImages);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "이미지 업로드 실패");
      return;
    }
    const { data, error } = await supabase
      .from("notes")
      .insert({
        ...targetPayload(target),
        parent_id: parentId,
        body: body || null,
        pros: null,
        cons: null,
        image_paths: imagePaths,
        author: nickname,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) => [...prev, data as Note]);
    setReplyingTo(null);
    setReplyDraft("");
    setReplyImages([]);
  }

  async function saveEdit(noteId: string, isReply: boolean) {
    setError(null);
    const hasContent = isReply
      ? editingDraft.body.trim() !== ""
      : editingDraft.body.trim() !== "" ||
        editingDraft.pros.trim() !== "" ||
        editingDraft.cons.trim() !== "";
    if (!hasContent) return;
    setBusy(true);
    const patch = isReply
      ? { body: trimToNull(editingDraft.body) }
      : {
          body: trimToNull(editingDraft.body),
          pros: trimToNull(editingDraft.pros),
          cons: trimToNull(editingDraft.cons),
          facet:
            target.kind === "ref" ? editingDraft.facet : null,
          ...(target.kind === "ref" && editingDraft.facet === "etc"
            ? { facet_label: trimToNull(editingDraft.facetLabel) }
            : {}),
        };
    const { data, error } = await supabase
      .from("notes")
      .update(patch)
      .eq("id", noteId)
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? (data as Note) : n)),
    );
    setEditingId(null);
    setEditingDraft(EMPTY);
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm("이 노트를 삭제할까요? (답글이 있으면 함께 사라져요)"))
      return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.from("notes").delete().eq("id", noteId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) =>
      prev.filter((n) => n.id !== noteId && n.parent_id !== noteId),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Notes — {notes.length}
        </h2>
        {showKinds &&
        (kindCounts.decision > 0 || kindCounts.open_question > 0) ? (
          <div className="flex items-center gap-1.5">
            {kindCounts.decision > 0 ? (
              <KindBadge
                kind="decision"
                label={`결정 ${kindCounts.decision}`}
              />
            ) : null}
            {kindCounts.open_question > 0 ? (
              <KindBadge
                kind="open_question"
                label={`열린 질문 ${kindCounts.open_question}`}
              />
            ) : null}
          </div>
        ) : null}
      </header>

      <ul className="flex flex-col gap-5">
        {topLevel.map((note) => {
          const replies = repliesByParent.get(note.id) ?? [];
          const mine = hydrated && nickname && nickname === note.author;
          const editing = editingId === note.id;
          const replying = replyingTo === note.id;
          return (
            <li
              key={note.id}
              id={`note-${note.id}`}
              className="flex flex-col gap-2 border-b border-border/40 pb-4 last:border-b-0 target:rounded-md target:ring-2 target:ring-foreground/40"
            >
              <NoteHead
                note={note}
                mine={!!mine}
                editing={editing}
                onEdit={() => {
                  setEditingId(note.id);
                  setEditingDraft(noteToDraft(note));
                }}
                onDelete={() => void deleteNote(note.id)}
                showKind={showKinds}
              />
              {editing ? (
                <NoteFields
                  draft={editingDraft}
                  onChange={setEditingDraft}
                  disabled={busy}
                  profiles={profiles}
                  showFacet={target.kind === "ref"}
                  gridApplicable={gridApplicable}
                />
              ) : (
                <NoteContent note={note} />
              )}
              {editing ? (
                <EditActions
                  busy={busy}
                  onCancel={() => {
                    setEditingId(null);
                    setEditingDraft(EMPTY);
                  }}
                  onSave={() => void saveEdit(note.id, false)}
                />
              ) : null}

              {replies.length > 0 ? (
                <ul className="flex flex-col gap-3 border-l-2 border-border/40 pl-3">
                  {replies.map((reply) => {
                    const replyMine =
                      hydrated && nickname && nickname === reply.author;
                    const replyEditing = editingId === reply.id;
                    return (
                      <li
                        key={reply.id}
                        id={`note-${reply.id}`}
                        className="flex flex-col gap-1.5 target:rounded-md target:ring-2 target:ring-foreground/40"
                      >
                        <NoteHead
                          note={reply}
                          mine={!!replyMine}
                          editing={replyEditing}
                          onEdit={() => {
                            setEditingId(reply.id);
                            setEditingDraft({
                              body: reply.body ?? "",
                              pros: "",
                              cons: "",
                              facet: null,
                              facetLabel: "",
                            });
                          }}
                          onDelete={() => void deleteNote(reply.id)}
                          compact
                        />
                        {replyEditing ? (
                          <>
                            <MentionInput
                              value={editingDraft.body}
                              onChange={(v) =>
                                setEditingDraft({
                                  ...editingDraft,
                                  body: v,
                                })
                              }
                              rows={3}
                              disabled={busy}
                              profiles={profiles}
                            />
                            <EditActions
                              busy={busy}
                              onCancel={() => {
                                setEditingId(null);
                                setEditingDraft(EMPTY);
                              }}
                              onSave={() => void saveEdit(reply.id, true)}
                            />
                          </>
                        ) : (
                          <>
                            {reply.body ? (
                              <div className="prose prose-sm prose-neutral max-w-none text-sm leading-relaxed">
                                <MarkdownWithMentions text={reply.body} />
                              </div>
                            ) : null}
                            {reply.image_paths &&
                            reply.image_paths.length > 0 ? (
                              <NoteImageStrip paths={reply.image_paths} />
                            ) : null}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {hydrated && nickname && !editing ? (
                replying ? (
                  <div className="flex flex-col gap-2 border-l-2 border-border/40 pl-3">
                    <MentionInput
                      value={replyDraft}
                      onChange={setReplyDraft}
                      rows={3}
                      placeholder="답글 — @ 입력하면 멘션 자동완성"
                      autoFocus
                      profiles={profiles}
                    />
                    <ImageAttacher
                      files={replyImages}
                      onChange={setReplyImages}
                      disabled={busy}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyDraft("");
                          setReplyImages([]);
                        }}
                        disabled={busy}
                      >
                        취소
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void addReply(note.id)}
                        disabled={
                          busy ||
                          (!replyDraft.trim() && replyImages.length === 0)
                        }
                      >
                        답글 등록
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(note.id);
                      setReplyDraft("");
                    }}
                    className="inline-flex w-fit items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  >
                    <CornerDownRight className="size-3" />
                    답글
                  </button>
                )
              ) : null}
            </li>
          );
        })}
        {topLevel.length === 0 ? (
          <li className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            아직 노트가 없습니다.
          </li>
        ) : null}
      </ul>

      <form onSubmit={addNote} className="flex flex-col gap-3">
        {showKinds ? (
          <KindPicker value={draftKind} onChange={setDraftKind} />
        ) : null}
        <NoteFields
          draft={draft}
          onChange={setDraft}
          disabled={hydrated && !nickname}
          profiles={profiles}
          images={draftImages}
          onImagesChange={setDraftImages}
          showFacet={target.kind === "ref"}
          gridApplicable={gridApplicable}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={busy || !draftHasContent || (hydrated && !nickname)}
          >
            노트 추가
          </Button>
        </div>
      </form>
    </div>
  );
}

function NoteHead({
  note,
  mine,
  editing,
  onEdit,
  onDelete,
  compact = false,
  showKind = false,
}: {
  note: Note;
  mine: boolean;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
  showKind?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div
        className={`flex flex-wrap items-center gap-2 font-mono uppercase tracking-wider text-muted-foreground ${
          compact ? "text-[10px]" : "text-[11px]"
        }`}
      >
        {compact ? (
          <MessageCircle aria-hidden className="size-3" />
        ) : null}
        <NicknamePill nickname={note.author} />
        {showKind && note.kind && note.kind !== "discussion" ? (
          <KindBadge kind={note.kind} />
        ) : null}
        {note.facet ? (
          <FacetBadge facet={note.facet} label={note.facet_label} />
        ) : null}
        <span>{formatDate(note.created_at)}</span>
        {note.created_at !== note.updated_at ? <span>· edited</span> : null}
      </div>
      {mine && !editing ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground"
            aria-label="edit"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            aria-label="delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EditActions({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        disabled={busy}
      >
        취소
      </Button>
      <Button type="button" size="sm" onClick={onSave} disabled={busy}>
        저장
      </Button>
    </div>
  );
}

function NoteFields({
  draft,
  onChange,
  disabled,
  profiles,
  images,
  onImagesChange,
  showFacet,
  gridApplicable,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  disabled?: boolean;
  profiles: Profile[];
  images?: File[];
  onImagesChange?: (next: File[]) => void;
  // Only ref notes carry a formal-analysis facet — project / project
  // update threads stay free-form.
  showFacet?: boolean;
  gridApplicable?: boolean;
}) {
  function appendToBody(snippet: string) {
    const sep = draft.body && !draft.body.endsWith("\n") ? "\n" : "";
    onChange({ ...draft, body: `${draft.body}${sep}${snippet}` });
  }
  return (
    <div className="flex flex-col gap-3">
      <FieldGroup label="장점" accent="text-emerald-600">
        <Textarea
          value={draft.pros}
          onChange={(e) => onChange({ ...draft, pros: e.target.value })}
          rows={2}
          disabled={disabled}
          placeholder="좋았던 점"
        />
      </FieldGroup>
      <FieldGroup label="단점·개선 아이디어" accent="text-rose-600">
        <Textarea
          value={draft.cons}
          onChange={(e) => onChange({ ...draft, cons: e.target.value })}
          rows={2}
          disabled={disabled}
          placeholder="아쉬운 점 + 어떻게 고치면 좋을지"
        />
      </FieldGroup>
      {showFacet ? (
        <FieldGroup label="분석 측면">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {NOTE_FACETS.map((f) => {
                const active = draft.facet === f;
                const label = f === "etc" ? "+ 기타" : FACET_LABEL[f];
                return (
                  <button
                    key={f}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...draft,
                        facet: active ? null : f,
                        // Drop the custom label when leaving etc.
                        facetLabel:
                          active || f !== "etc" ? "" : draft.facetLabel,
                      })
                    }
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : INACTIVE_CHIP
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {draft.facet === "etc" ? (
              <Input
                value={draft.facetLabel}
                onChange={(e) =>
                  onChange({ ...draft, facetLabel: e.target.value })
                }
                disabled={disabled}
                placeholder="측면 이름 (예: 색·재료·장식)"
                maxLength={40}
              />
            ) : draft.facet === "composition" ||
              draft.facet === "type" ||
              draft.facet === "material" ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {(draft.facet === "composition"
                  ? compositionPresets(Boolean(gridApplicable))
                  : FACET_PRESETS[draft.facet]
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={disabled}
                    onClick={() => appendToBody(preset)}
                    className="rounded-full border border-input px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    + {preset}
                  </button>
                ))}
                <CustomPresetInput
                  disabled={disabled}
                  onAdd={(value) => appendToBody(value)}
                />
              </div>
            ) : null}
          </div>
        </FieldGroup>
      ) : null}
      <FieldGroup label="메모">
        <MentionInput
          value={draft.body}
          onChange={(v) => onChange({ ...draft, body: v })}
          rows={3}
          disabled={disabled}
          placeholder="마크다운, @ 입력하면 멘션 자동완성"
          profiles={profiles}
        />
      </FieldGroup>
      {images && onImagesChange ? (
        <FieldGroup label="이미지">
          <ImageAttacher
            files={images}
            onChange={onImagesChange}
            disabled={disabled}
          />
        </FieldGroup>
      ) : null}
    </div>
  );
}

function FieldGroup({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        className={`font-mono text-[11px] uppercase tracking-widest ${accent ?? "text-muted-foreground"}`}
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

function NoteContent({ note }: { note: Note }) {
  return (
    <div className="flex flex-col gap-3">
      {note.pros ? (
        <Section label="장점" accent="text-emerald-600" content={note.pros} />
      ) : null}
      {note.cons ? (
        <Section label="단점" accent="text-rose-600" content={note.cons} />
      ) : null}
      {note.body ? (
        <div className="prose prose-sm prose-neutral max-w-none text-sm leading-relaxed">
          <MarkdownWithMentions text={note.body} />
        </div>
      ) : null}
      {note.image_paths && note.image_paths.length > 0 ? (
        <NoteImageStrip paths={note.image_paths} />
      ) : null}
    </div>
  );
}

function ImageAttacher({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(
    () => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [files],
  );
  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p.url);
    };
  }, [previews]);

  function add(incoming: FileList | null) {
    if (!incoming) return;
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (f.type.startsWith("image/")) next.push(f);
    }
    onChange(next);
  }
  function remove(i: number) {
    const next = files.slice();
    next.splice(i, 1);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <ImagePlus className="size-3" /> 이미지
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      {previews.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {previews.map((p, i) => (
            <li key={p.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt=""
                className="size-12 rounded-sm object-cover"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                aria-label="remove"
                className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 text-muted-foreground shadow hover:text-destructive disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Section({
  label,
  accent,
  content,
}: {
  label: string;
  accent: string;
  content: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p
        className={`font-mono text-[10px] uppercase tracking-widest ${accent}`}
      >
        {label}
      </p>
      <div className="prose prose-sm prose-neutral max-w-none text-sm leading-relaxed">
        <MarkdownWithMentions text={content} />
      </div>
    </div>
  );
}

function KindBadge({ kind, label }: { kind: NoteKind; label?: string }) {
  const meta = KIND_META[kind];
  const Icon = meta.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider leading-none",
        meta.activeChip,
      )}
    >
      <Icon className="size-3" />
      {label ?? meta.label}
    </span>
  );
}

// Inline "+기타" affordance inside a facet's preset row. Clicking
// expands a small input where the user can type any custom text and
// commit it (Enter or arrow button) to append into the note body the
// same way the canned presets do. Collapses back when blurred empty.
function CustomPresetInput({
  disabled,
  onAdd,
}: {
  disabled?: boolean;
  onAdd: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setOpen(false);
      return;
    }
    onAdd(trimmed);
    setValue("");
    // Stay open for rapid entry of multiple custom presets.
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          // Defer focus so the input renders first.
          queueMicrotask(() => inputRef.current?.focus());
        }}
        className="rounded-full border border-input px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground hover:text-foreground"
      >
        + 기타
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-foreground bg-background pl-2.5 pr-1 py-0.5">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setValue("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        disabled={disabled}
        className="w-32 bg-transparent font-mono text-[10px] tracking-wide outline-none"
        placeholder="직접 입력"
        maxLength={40}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={commit}
        disabled={disabled || !value.trim()}
        className="rounded-full px-1.5 py-0.5 font-mono text-[10px] text-foreground disabled:opacity-30"
        aria-label="추가"
      >
        ↵
      </button>
    </span>
  );
}

function FacetBadge({
  facet,
  label,
}: {
  facet: NoteFacet;
  label?: string | null;
}) {
  // For "etc" use the user-entered label; fall back to the generic
  // "기타" if it's missing.
  const text = facet === "etc" ? (label || "기타") : FACET_LABEL[facet];
  return (
    <span className="inline-flex items-center rounded-full border border-input px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider leading-none text-muted-foreground">
      {text}
    </span>
  );
}

function KindPicker({
  value,
  onChange,
}: {
  value: NoteKind;
  onChange: (next: NoteKind) => void;
}) {
  const kinds: NoteKind[] = ["discussion", "decision", "open_question"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        종류
      </span>
      {kinds.map((k) => {
        const meta = KIND_META[k];
        const Icon = meta.Icon;
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
              active ? meta.activeChip : INACTIVE_CHIP,
            )}
          >
            <Icon className="size-3" />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
