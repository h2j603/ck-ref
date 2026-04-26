"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";
import type { Board } from "@/lib/types";

type BoardLite = Pick<Board, "id" | "title" | "created_by">;

export function AddToBoardDialog({ refId }: { refId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<BoardLite[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setError(null);
      const [boardsRes, membershipRes] = await Promise.all([
        supabase
          .from("boards")
          .select("id, title, created_by")
          .order("created_at", { ascending: false }),
        supabase
          .from("board_items")
          .select("board_id")
          .eq("ref_id", refId),
      ]);
      if (cancelled) return;
      if (boardsRes.error) setError(boardsRes.error.message);
      else setBoards((boardsRes.data ?? []) as BoardLite[]);
      if (!membershipRes.error) {
        setMemberOf(
          new Set(
            ((membershipRes.data ?? []) as { board_id: string }[]).map(
              (m) => m.board_id,
            ),
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase, refId]);

  async function toggle(board: BoardLite) {
    setError(null);
    setBusyId(board.id);
    const inBoard = memberOf.has(board.id);
    const op = inBoard
      ? supabase
          .from("board_items")
          .delete()
          .eq("board_id", board.id)
          .eq("ref_id", refId)
      : supabase.from("board_items").insert({
          board_id: board.id,
          ref_id: refId,
          added_by: nickname || null,
        });
    const { error } = await op;
    setBusyId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setMemberOf((prev) => {
      const next = new Set(prev);
      if (inBoard) next.delete(board.id);
      else next.add(board.id);
      return next;
    });
  }

  async function createBoardAndAdd() {
    setError(null);
    if (!newTitle.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("boards")
      .insert({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        created_by: nickname || null,
      })
      .select("id, title, created_by")
      .single();
    if (error) {
      setError(error.message);
      setCreating(false);
      return;
    }
    const board = data as BoardLite;
    const { error: addErr } = await supabase.from("board_items").insert({
      board_id: board.id,
      ref_id: refId,
      added_by: nickname || null,
    });
    setCreating(false);
    if (addErr) {
      setError(addErr.message);
      return;
    }
    setBoards((prev) => [board, ...prev]);
    setMemberOf((prev) => new Set(prev).add(board.id));
    setNewTitle("");
    setNewDescription("");
  }

  if (!hydrated || !nickname) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
        >
          <Plus className="size-3" /> 보드에 추가
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>보드에 추가</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {boards.length > 0 ? (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {boards.map((b) => {
                const inBoard = memberOf.has(b.id);
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => toggle(b)}
                      disabled={busyId !== null}
                      className="flex w-full items-center justify-between rounded-md border border-input px-3 py-2 text-left text-sm transition-colors hover:border-foreground"
                    >
                      <span className="truncate">{b.title}</span>
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wider ${
                          inBoard ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {inBoard ? "✓ 추가됨" : "+ 추가"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              아직 보드가 없어요. 아래에서 만들어주세요.
            </p>
          )}

          <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
            <Label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              새 보드
            </Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="제목"
            />
            <Textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={2}
              placeholder="설명 (선택)"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={creating || busyId !== null}
          >
            닫기
          </Button>
          <Button
            type="button"
            onClick={createBoardAndAdd}
            disabled={creating || !newTitle.trim()}
          >
            {creating ? "만드는 중…" : "만들고 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
