"use client";

import { CheckCircle2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";
import type { ProjectStatus } from "@/lib/types";

export function ProjectOwnerActions({
  projectId,
  status,
  createdBy,
}: {
  projectId: string;
  status: ProjectStatus;
  createdBy: string | null;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  if (!createdBy || !nickname || nickname !== createdBy) return null;

  async function toggleStatus() {
    setError(null);
    setBusy(true);
    const next: ProjectStatus = status === "in_progress" ? "done" : "in_progress";
    const { error } = await supabase
      .from("projects")
      .update({ status: next })
      .eq("id", projectId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    window.location.reload();
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "이 작업을 삭제할까요? 업데이트와 토론도 함께 사라집니다.",
      )
    )
      return;
    setError(null);
    setBusy(true);
    const { data, error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .select("id");
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setError(
        "삭제되지 않았어요. RLS 정책이 anon에 DELETE를 허용하는지 확인해주세요.",
      );
      return;
    }
    window.location.assign("/wip");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={() => void toggleStatus()}
        disabled={busy}
      >
        {status === "in_progress" ? (
          <>
            <CheckCircle2 className="size-3" /> 완료로
          </>
        ) : (
          <>
            <RotateCcw className="size-3" /> 진행 중으로
          </>
        )}
      </Button>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px]"
      >
        <Link href={`/wip/${projectId}/edit`}>
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
        <Trash2 className="size-3" /> 삭제
      </Button>
      {error ? <p className="w-full text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
