"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { NicknamePill } from "@/components/nickname-pill";
import { Button } from "@/components/ui/button";
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
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
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

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nickname) {
      setError("/gate에서 닉네임을 먼저 등록해주세요.");
      return;
    }
    const body = draft.trim();
    if (!body) return;

    setBusy(true);
    const { data, error } = await supabase
      .from("notes")
      .insert({ ref_id: refId, body, author: nickname })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) => [...prev, data as Note]);
    setDraft("");
  }

  async function saveEdit(noteId: string) {
    setError(null);
    const body = editingBody.trim();
    if (!body) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("notes")
      .update({ body })
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
    setEditingBody("");
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm("이 노트를 삭제할까요?")) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.from("notes").delete().eq("id", noteId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Notes — {notes.length}
        </h2>
      </header>

      <ul className="flex flex-col gap-5">
        {notes.map((note) => {
          const mine = hydrated && nickname && nickname === note.author;
          const editing = editingId === note.id;
          return (
            <li
              key={note.id}
              className="flex flex-col gap-2 border-b border-border/40 pb-4 last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <NicknamePill nickname={note.author} />
                  <span>{formatDate(note.created_at)}</span>
                  {note.created_at !== note.updated_at ? <span>· edited</span> : null}
                </div>
                {mine && !editing ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditingBody(note.body);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="edit"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteNote(note.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
              {editing ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    rows={4}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(null);
                        setEditingBody("");
                      }}
                    >
                      취소
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveEdit(note.id)}
                      disabled={busy}
                    >
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-sm prose-neutral max-w-none text-sm leading-relaxed">
                  <ReactMarkdown>{note.body}</ReactMarkdown>
                </div>
              )}
            </li>
          );
        })}
        {notes.length === 0 ? (
          <li className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            아직 노트가 없습니다.
          </li>
        ) : null}
      </ul>

      <form onSubmit={addNote} className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            hydrated && !nickname
              ? "/gate에서 닉네임 등록 후 작성하세요"
              : "마크다운으로 노트를 적어주세요"
          }
          rows={4}
          disabled={hydrated && !nickname}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={busy || !draft.trim() || (hydrated && !nickname)}
          >
            노트 추가
          </Button>
        </div>
      </form>
    </div>
  );
}
