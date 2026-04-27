"use client";

import { MessageSquareText, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { NicknamePill } from "@/components/nickname-pill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { cn } from "@/lib/utils";

// Small chat-bubble icon overlaid on a ref card. Tap to open a dialog
// with the full reason text. Used on both project-level and per-update
// ref attachments. `compact` makes the icon a touch smaller for the
// per-update grids. When `onSave` is provided and the current user added
// the attachment, the dialog flips into an editor.
export function ReasonBadge({
  reason,
  addedBy,
  compact = false,
  onSave,
  onClear,
}: {
  reason: string;
  addedBy?: string | null;
  compact?: boolean;
  onSave?: (newReason: string) => Promise<void>;
  onClear?: () => Promise<void>;
}) {
  const { nickname, hydrated } = useNickname();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMine = hydrated && nickname && addedBy && nickname === addedBy;
  const canEdit = Boolean(isMine && onSave);

  function startEdit() {
    setDraft(reason);
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!onSave) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("내용을 입력해주세요. 비우려면 '이유 지우기'를 누르세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!onClear) return;
    if (!window.confirm("이유를 지울까요?")) return;
    setBusy(true);
    setError(null);
    try {
      await onClear();
      setEditing(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "absolute left-1 top-1 z-10 inline-flex items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-colors hover:text-foreground",
          compact ? "size-5 p-1" : "size-6 p-1",
        )}
        aria-label="추가 이유 보기"
      >
        <MessageSquareText className={compact ? "size-3" : "size-3.5"} />
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "이유 수정" : "추가 이유"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {addedBy ? (
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <NicknamePill nickname={addedBy} />
              </div>
            ) : null}
            {editing ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                disabled={busy}
                placeholder="어떤 점이 영감이 됐나요?"
                className="text-sm"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {reason}
              </p>
            )}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          {canEdit ? (
            <DialogFooter>
              {editing ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditing(false)}
                    disabled={busy}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void save()}
                    disabled={busy}
                  >
                    {busy ? "저장 중…" : "저장"}
                  </Button>
                </>
              ) : (
                <>
                  {onClear ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void clear()}
                      disabled={busy}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3" /> 이유 지우기
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startEdit}
                    disabled={busy}
                  >
                    <Pencil className="size-3" /> 수정
                  </Button>
                </>
              )}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
