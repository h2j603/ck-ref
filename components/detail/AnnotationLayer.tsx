"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import {
  FALLBACK_PROFILES,
  findProfile,
  type Profile,
} from "@/lib/profiles";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { RefAnnotation } from "@/lib/types";

type Draft =
  | { kind: "new"; x_pct: number; y_pct: number; body: string }
  | { kind: "edit"; id: string; body: string };

export function AnnotationLayer({
  refId,
  imagePath,
  imageUrl,
  alt,
  width,
  height,
  initial,
  profiles,
}: {
  refId: string;
  imagePath: string;
  imageUrl: string;
  alt: string;
  width: number;
  height: number;
  initial: RefAnnotation[];
  profiles: Profile[];
}) {
  void imagePath;
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [items, setItems] = useState<RefAnnotation[]>(initial);
  const [addMode, setAddMode] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Refresh on mount in case other users annotated since the page rendered.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("ref_annotations")
        .select("*")
        .eq("ref_id", refId)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setItems(data as RefAnnotation[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, refId]);

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!addMode || !nickname || draft) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
    const y_pct = ((e.clientY - rect.top) / rect.height) * 100;
    setDraft({ kind: "new", x_pct, y_pct, body: "" });
    setOpenId(null);
  }

  async function saveDraft() {
    if (!draft || !nickname) return;
    const body = draft.body.trim();
    if (!body) {
      setError("내용을 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    if (draft.kind === "new") {
      const { data, error } = await supabase
        .from("ref_annotations")
        .insert({
          ref_id: refId,
          x_pct: draft.x_pct,
          y_pct: draft.y_pct,
          body,
          author: nickname,
        })
        .select("*")
        .single();
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      const created = data as RefAnnotation;
      setItems((prev) => [...prev, created]);
      setDraft(null);
      setAddMode(false);
      setOpenId(created.id);
    } else {
      const { data, error } = await supabase
        .from("ref_annotations")
        .update({ body, updated_at: new Date().toISOString() })
        .eq("id", draft.id)
        .select("*")
        .single();
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      setItems((prev) =>
        prev.map((a) => (a.id === draft.id ? (data as RefAnnotation) : a)),
      );
      setDraft(null);
    }
  }

  async function deleteAnnotation(id: string) {
    if (!window.confirm("이 주석을 삭제할까요?")) return;
    setError(null);
    setBusy(true);
    const { data, error } = await supabase
      .from("ref_annotations")
      .delete()
      .eq("id", id)
      .select("id");
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setError("삭제되지 않았어요. RLS 정책을 확인해주세요.");
      return;
    }
    setItems((prev) => prev.filter((a) => a.id !== id));
    setOpenId(null);
    setDraft(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className={cn(
          "relative w-full bg-muted",
          addMode && "cursor-crosshair",
        )}
        style={{ aspectRatio: `${width} / ${height}` }}
        onClick={handleImageClick}
      >
        <Image
          src={imageUrl}
          alt={alt}
          fill
          sizes="(max-width: 1024px) 100vw, 70vw"
          className="object-contain"
          priority
        />
        {items.map((a) => {
          const profile =
            findProfile(profiles, a.author) ??
            findProfile(FALLBACK_PROFILES, a.author);
          const open = openId === a.id;
          return (
            <Marker
              key={a.id}
              annotation={a}
              profile={profile}
              open={open}
              onToggle={(next) => {
                setOpenId(next ? a.id : null);
                if (!next && draft?.kind === "edit" && draft.id === a.id) {
                  setDraft(null);
                }
              }}
              isMine={hydrated && nickname === a.author}
              onEdit={() => {
                setDraft({ kind: "edit", id: a.id, body: a.body });
                setOpenId(a.id);
              }}
              onDelete={() => void deleteAnnotation(a.id)}
              editing={draft?.kind === "edit" && draft.id === a.id}
              draftBody={
                draft?.kind === "edit" && draft.id === a.id ? draft.body : null
              }
              onDraftChange={(v) =>
                setDraft((d) =>
                  d && d.kind === "edit" ? { ...d, body: v } : d,
                )
              }
              onSave={() => void saveDraft()}
              onCancelEdit={() => setDraft(null)}
              busy={busy}
            />
          );
        })}
        {draft?.kind === "new" ? (
          <NewMarker
            x_pct={draft.x_pct}
            y_pct={draft.y_pct}
            body={draft.body}
            onChange={(v) =>
              setDraft((d) => (d && d.kind === "new" ? { ...d, body: v } : d))
            }
            onSave={() => void saveDraft()}
            onCancel={() => setDraft(null)}
            busy={busy}
            color={
              (nickname && findProfile(profiles, nickname)?.color) ?? "#a8a29e"
            }
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Annotations — {items.length}
        </p>
        {hydrated && nickname ? (
          <Button
            type="button"
            variant={addMode ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              setAddMode((m) => !m);
              setDraft(null);
            }}
          >
            <Plus className="size-3" /> {addMode ? "취소" : "주석 추가"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Marker({
  annotation,
  profile,
  open,
  onToggle,
  isMine,
  onEdit,
  onDelete,
  editing,
  draftBody,
  onDraftChange,
  onSave,
  onCancelEdit,
  busy,
}: {
  annotation: RefAnnotation;
  profile: Profile | null;
  open: boolean;
  onToggle: (next: boolean) => void;
  isMine: boolean;
  onEdit: () => void;
  onDelete: () => void;
  editing: boolean;
  draftBody: string | null;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  busy: boolean;
}) {
  const initial = profile?.display_name?.slice(0, 1) ?? annotation.author.slice(0, 1);
  const color = profile?.color ?? "#a8a29e";
  const popoverRight = annotation.x_pct > 60;
  const popoverBottom = annotation.y_pct > 60;
  return (
    <div
      className="absolute"
      style={{
        left: `${annotation.x_pct}%`,
        top: `${annotation.y_pct}%`,
        transform: "translate(-50%, -50%)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onToggle(!open)}
        aria-label={`annotation by ${annotation.author}`}
        className={cn(
          "flex size-5 items-center justify-center rounded-full border border-white text-[9px] font-medium text-white shadow ring-2 ring-black/30 transition-transform hover:scale-110",
          open && "scale-110",
        )}
        style={{ backgroundColor: color }}
      >
        {initial}
      </button>
      {open ? (
        <div
          className={cn(
            "absolute z-10 flex w-56 flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm shadow-lg",
            popoverRight ? "right-3" : "left-3",
            popoverBottom ? "bottom-3" : "top-3",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="font-mono text-[10px] uppercase tracking-wider"
              style={{ color }}
            >
              @{profile?.display_name ?? annotation.author}
            </span>
            <button
              type="button"
              onClick={() => onToggle(false)}
              aria-label="close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
          {editing ? (
            <>
              <Textarea
                value={draftBody ?? ""}
                onChange={(e) => onDraftChange(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onCancelEdit}
                  disabled={busy}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onSave}
                  disabled={busy}
                >
                  저장
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {annotation.body}
              </p>
              {isMine ? (
                <div className="flex justify-end gap-2 border-t border-border/40 pt-1.5">
                  <button
                    type="button"
                    onClick={onEdit}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="edit"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="delete"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function NewMarker({
  x_pct,
  y_pct,
  body,
  onChange,
  onSave,
  onCancel,
  busy,
  color,
}: {
  x_pct: number;
  y_pct: number;
  body: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  color: string;
}) {
  const popoverRight = x_pct > 60;
  const popoverBottom = y_pct > 60;
  return (
    <div
      className="absolute z-20"
      style={{
        left: `${x_pct}%`,
        top: `${y_pct}%`,
        transform: "translate(-50%, -50%)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        aria-hidden
        className="flex size-5 items-center justify-center rounded-full border border-white text-[9px] font-medium text-white shadow ring-2 ring-black/30"
        style={{ backgroundColor: color }}
      >
        +
      </span>
      <div
        className={cn(
          "absolute z-10 flex w-56 flex-col gap-2 rounded-md border border-border bg-background p-3 shadow-lg",
          popoverRight ? "right-3" : "left-3",
          popoverBottom ? "bottom-3" : "top-3",
        )}
      >
        <Textarea
          value={body}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          autoFocus
          placeholder="이 위치에 코멘트…"
          className="text-sm"
        />
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={busy || !body.trim()}
          >
            저장
          </Button>
        </div>
      </div>
    </div>
  );
}
