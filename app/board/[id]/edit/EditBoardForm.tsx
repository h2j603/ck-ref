"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";

export function EditBoardForm({
  boardId,
  createdBy,
  initial,
}: {
  boardId: string;
  createdBy: string | null;
  initial: { title: string; description: string | null };
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        loading…
      </p>
    );
  }
  if (!createdBy || nickname !== createdBy) {
    return (
      <p className="text-sm text-muted-foreground">
        본인이 만든 보드만 수정할 수 있어요.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("boards")
      .update({
        title: title.trim(),
        description: description.trim() || null,
      })
      .eq("id", boardId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    window.location.assign(`/board/${boardId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          제목
        </Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          설명
        </Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "저장 중…" : "저장"}
        </Button>
      </div>
    </form>
  );
}
