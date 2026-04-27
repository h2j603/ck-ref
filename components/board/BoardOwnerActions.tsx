"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";

export function BoardOwnerActions({
  boardId,
  createdBy,
}: {
  boardId: string;
  createdBy: string | null;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  if (!createdBy || !nickname || nickname !== createdBy) return null;

  async function handleDelete() {
    if (!window.confirm("이 보드를 삭제할까요? ref들은 그대로 남고 묶음만 사라져요.")) return;
    setError(null);
    setBusy(true);
    // .select() so we can tell zero-row deletes (RLS) apart from errors.
    const { data, error } = await supabase
      .from("boards")
      .delete()
      .eq("id", boardId)
      .select("id");
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    if (!data || data.length === 0) {
      setError(
        "삭제되지 않았어요. RLS 정책이 anon에 DELETE를 허용하는지 확인해주세요.",
      );
      setBusy(false);
      return;
    }
    window.location.assign("/board");
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px]"
      >
        <Link href={`/board/${boardId}/edit`}>
          <Pencil className="size-3" /> 수정
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
        onClick={handleDelete}
        disabled={busy}
      >
        <Trash2 className="size-3" /> {busy ? "삭제 중…" : "삭제"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
