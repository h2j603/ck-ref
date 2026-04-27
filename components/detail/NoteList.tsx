"use client";

import { CornerDownRight, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

import { NicknamePill } from "@/components/nickname-pill";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";
import type { Note } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

type Draft = { body: string; pros: string; cons: string };
const EMPTY: Draft = { body: "", pros: "", cons: "" };

function trimToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

function noteToDraft(note: Note): Draft {
  return {
    body: note.body ?? "",
    pros: note.pros ?? "",
    cons: note.cons ?? "",
  };
}

export function NoteList({
  refId,
  initialNotes,
}: {
  refId: string;
  initialNotes: Note[];
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft>(EMPTY);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refetch on mount in case server data is stale.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("ref_id", refId)
        .order("created_at", { ascending: true });
      if (!cancelled && !error && data) setNotes(data as Note[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, refId]);

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
    draft.cons.trim() !== "";

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nickname) {
      setError("/gate에서 닉네임을 먼저 등록해주세요.");
      return;
    }
    if (!draftHasContent) return;

    setBusy(true);
    const { data, error } = await supabase
      .from("notes")
      .insert({
        ref_id: refId,
        parent_id: null,
        body: trimToNull(draft.body),
        pros: trimToNull(draft.pros),
        cons: trimToNull(draft.cons),
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
  }

  async function addReply(parentId: string) {
    setError(null);
    if (!nickname) {
      setError("/gate에서 닉네임을 먼저 등록해주세요.");
      return;
    }
    const body = replyDraft.trim();
    if (!body) return;

    setBusy(true);
    const { data, error } = await supabase
      .from("notes")
      .insert({
        ref_id: refId,
        parent_id: parentId,
        body,
        pros: null,
        cons: null,
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
      <header className="flex items-baseline justify-between border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Notes — {notes.length}
        </h2>
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
              className="flex flex-col gap-2 border-b border-border/40 pb-4 last:border-b-0"
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
              />
              {editing ? (
                <NoteFields
                  draft={editingDraft}
                  onChange={setEditingDraft}
                  disabled={busy}
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
                      <li key={reply.id} className="flex flex-col gap-1.5">
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
                            });
                          }}
                          onDelete={() => void deleteNote(reply.id)}
                          compact
                        />
                        {replyEditing ? (
                          <>
                            <Textarea
                              value={editingDraft.body}
                              onChange={(e) =>
                                setEditingDraft({
                                  ...editingDraft,
                                  body: e.target.value,
                                })
                              }
                              rows={3}
                              disabled={busy}
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
                        ) : reply.body ? (
                          <div className="prose prose-sm prose-neutral max-w-none text-sm leading-relaxed">
                            <ReactMarkdown>{reply.body}</ReactMarkdown>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {hydrated && nickname && !editing ? (
                replying ? (
                  <div className="flex flex-col gap-2 border-l-2 border-border/40 pl-3">
                    <Textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      rows={3}
                      placeholder="답글을 적어주세요"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyDraft("");
                        }}
                        disabled={busy}
                      >
                        취소
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void addReply(note.id)}
                        disabled={busy || !replyDraft.trim()}
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
        <NoteFields
          draft={draft}
          onChange={setDraft}
          disabled={hydrated && !nickname}
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
}: {
  note: Note;
  mine: boolean;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div
        className={`flex items-center gap-2 font-mono uppercase tracking-wider text-muted-foreground ${
          compact ? "text-[10px]" : "text-[11px]"
        }`}
      >
        {compact ? (
          <MessageCircle aria-hidden className="size-3" />
        ) : null}
        <NicknamePill nickname={note.author} />
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
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  disabled?: boolean;
}) {
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
      <FieldGroup label="단점" accent="text-rose-600">
        <Textarea
          value={draft.cons}
          onChange={(e) => onChange({ ...draft, cons: e.target.value })}
          rows={2}
          disabled={disabled}
          placeholder="아쉬운 점"
        />
      </FieldGroup>
      <FieldGroup label="메모">
        <Textarea
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
          rows={3}
          disabled={disabled}
          placeholder="마크다운 가능"
        />
      </FieldGroup>
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
          <ReactMarkdown>{note.body}</ReactMarkdown>
        </div>
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
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
