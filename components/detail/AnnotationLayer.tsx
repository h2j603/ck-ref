"use client";

import { Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

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
import type { AnnotationTarget, RefAnnotation } from "@/lib/types";

type DraftNew = {
  kind: "new";
  x_pct: number;
  y_pct: number;
  body: string;
};
type DraftEdit = {
  kind: "edit";
  id: string;
  body: string;
};
type Draft = DraftNew | DraftEdit;

export function AnnotationLayer({
  target,
  imageUrl,
  alt,
  width,
  height,
  initial,
  profiles,
  sourceUrl,
}: {
  target: AnnotationTarget;
  imageUrl: string;
  alt: string;
  width: number;
  height: number;
  initial: RefAnnotation[];
  profiles: Profile[];
  // When set and we're not in add-mode, clicking the image (anywhere
  // outside an existing annotation pin) opens this URL in a new tab.
  // Refs pass their source_url here; project updates don't have one.
  sourceUrl?: string | null;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [items, setItems] = useState<RefAnnotation[]>(initial);
  const [addMode, setAddMode] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetColumn =
    target.kind === "ref"
      ? "ref_id"
      : target.kind === "ref_image"
        ? "ref_image_id"
        : "project_update_id";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("ref_annotations")
        .select("*")
        .eq(targetColumn, target.id)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setItems(data as RefAnnotation[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, targetColumn, target.id]);

  // Open the annotation referenced by #ann-<id> in the URL — used by activity
  // feed deeplinks. We re-evaluate after items load so the matched one
  // actually exists in state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.location.hash.match(/^#ann-([0-9a-f-]+)$/i);
    if (!m) return;
    const target = m[1];
    if (items.some((a) => a.id === target)) {
      setOpenId(target);
    }
  }, [items]);

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    // Annotation pins handle their own clicks (stopPropagation + the
    // closest-check below) so neither path swallows them.
    if ((e.target as HTMLElement).closest("[data-annotation]")) return;

    if (addMode && nickname && !draft) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
      const y_pct = ((e.clientY - rect.top) / rect.height) * 100;
      setDraft({ kind: "new", x_pct, y_pct, body: "" });
      setOpenId(null);
      return;
    }

    // Not adding an annotation — fall through to the source link if the
    // ref has one. Skip when an annotation popover is open so users can
    // close it by clicking the image without being teleported away.
    if (sourceUrl && openId === null && !draft) {
      window.open(sourceUrl, "_blank", "noopener,noreferrer");
    }
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
          ref_id: target.kind === "ref" ? target.id : null,
          ref_image_id: target.kind === "ref_image" ? target.id : null,
          project_update_id:
            target.kind === "project_update" ? target.id : null,
          kind: "point",
          x_pct: draft.x_pct,
          y_pct: draft.y_pct,
          w_pct: null,
          h_pct: null,
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

  const showItems = !hidden;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "relative w-full select-none bg-muted",
          addMode
            ? "cursor-crosshair"
            : sourceUrl && "cursor-pointer",
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
          draggable={false}
          priority
        />

        {showItems
          ? items.map((a) => {
              const profile =
                findProfile(profiles, a.author) ??
                findProfile(FALLBACK_PROFILES, a.author);
              const open = openId === a.id;
              const editing = draft?.kind === "edit" && draft.id === a.id;
              return (
                <AnnotationView
                  key={a.id}
                  annotation={a}
                  profile={profile}
                  open={open}
                  editing={editing}
                  draftBody={editing ? (draft as DraftEdit).body : null}
                  isMine={hydrated && nickname === a.author}
                  busy={busy}
                  onToggle={(next) => {
                    setOpenId(next ? a.id : null);
                    if (!next && editing) setDraft(null);
                  }}
                  onEdit={() => {
                    setDraft({ kind: "edit", id: a.id, body: a.body });
                    setOpenId(a.id);
                  }}
                  onDelete={() => void deleteAnnotation(a.id)}
                  onDraftChange={(v) =>
                    setDraft((d) =>
                      d && d.kind === "edit" ? { ...d, body: v } : d,
                    )
                  }
                  onSave={() => void saveDraft()}
                  onCancelEdit={() => setDraft(null)}
                />
              );
            })
          : null}

        {draft?.kind === "new" ? (
          <NewPoint
            x_pct={draft.x_pct}
            y_pct={draft.y_pct}
            body={draft.body}
            color={
              (nickname && findProfile(profiles, nickname)?.color) ?? "#a8a29e"
            }
            onChange={(v) =>
              setDraft((d) => (d && d.kind === "new" ? { ...d, body: v } : d))
            }
            onSave={() => void saveDraft()}
            onCancel={() => setDraft(null)}
            busy={busy}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Annotations — {items.length}
          {hidden ? " (hidden)" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            type="button"
            variant={hidden ? "default" : "outline"}
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => setHidden((h) => !h)}
          >
            {hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            {hidden ? "주석 보기" : "주석 숨기기"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function AnnotationView({
  annotation,
  profile,
  open,
  editing,
  draftBody,
  isMine,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onDraftChange,
  onSave,
  onCancelEdit,
}: {
  annotation: RefAnnotation;
  profile: Profile | null;
  open: boolean;
  editing: boolean;
  draftBody: string | null;
  isMine: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
}) {
  const initial =
    profile?.display_name?.slice(0, 1) ?? annotation.author.slice(0, 1);
  const color = profile?.color ?? "#a8a29e";

  // Existing rows from the brief 'area' experiment are rendered as a point at
  // their visual center so the data isn't lost.
  const cx =
    annotation.kind === "area" && annotation.w_pct
      ? annotation.x_pct + annotation.w_pct / 2
      : annotation.x_pct;
  const cy =
    annotation.kind === "area" && annotation.h_pct
      ? annotation.y_pct + annotation.h_pct / 2
      : annotation.y_pct;

  const popoverRight = cx > 60;
  const popoverBottom = cy > 60;
  return (
    <div
      data-annotation
      className="absolute"
      style={{
        left: `${cx}%`,
        top: `${cy}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!open);
        }}
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
        <Popover
          color={color}
          displayName={profile?.display_name ?? annotation.author}
          body={annotation.body}
          editing={editing}
          draftBody={draftBody}
          isMine={isMine}
          busy={busy}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onDraftChange={onDraftChange}
          onSave={onSave}
          onCancelEdit={onCancelEdit}
          anchor={popoverRight ? { right: 12 } : { left: 12 }}
          verticalAnchor={popoverBottom ? "bottom" : "top"}
        />
      ) : null}
    </div>
  );
}

function Popover({
  color,
  displayName,
  body,
  editing,
  draftBody,
  isMine,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onDraftChange,
  onSave,
  onCancelEdit,
  anchor,
  verticalAnchor,
}: {
  color: string;
  displayName: string;
  body: string;
  editing: boolean;
  draftBody: string | null;
  isMine: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  anchor: React.CSSProperties;
  verticalAnchor: "top" | "bottom";
}) {
  return (
    <div
      data-annotation
      className="absolute z-10 flex w-56 flex-col gap-2 rounded-md border border-border bg-background p-3 text-sm shadow-lg"
      style={{
        ...anchor,
        ...(verticalAnchor === "top" ? { top: 12 } : { bottom: 12 }),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
          style={{ color }}
        >
          @{displayName}
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
            <Button type="button" size="sm" onClick={onSave} disabled={busy}>
              저장
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
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
  );
}

function NewPoint({
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
      data-annotation
      className="absolute z-20"
      style={{
        left: `${x_pct}%`,
        top: `${y_pct}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        aria-hidden
        className="flex size-5 items-center justify-center rounded-full border border-white text-[9px] font-medium text-white shadow ring-2 ring-black/30"
        style={{ backgroundColor: color }}
      >
        +
      </span>
      <div
        data-annotation
        className="absolute z-10 flex w-56 flex-col gap-2 rounded-md border border-border bg-background p-3 shadow-lg"
        style={{
          ...(popoverRight ? { right: 12 } : { left: 12 }),
          ...(popoverBottom ? { bottom: 12 } : { top: 12 }),
        }}
        onClick={(e) => e.stopPropagation()}
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
