"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";

export function DesignerOwnerActions({
  designerId,
  slug,
  createdBy,
}: {
  designerId: string;
  slug: string;
  createdBy: string | null;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  if (!createdBy || !nickname || nickname !== createdBy) return null;

  async function handleDelete() {
    if (
      !window.confirm(
        "이 디자이너를 삭제할까요? 연결된 레퍼런스에서 이 디자이너 표시가 함께 사라집니다.",
      )
    )
      return;
    setError(null);
    setBusy(true);
    const { error } = await supabase
      .from("designers")
      .delete()
      .eq("id", designerId);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    window.location.assign("/designer");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
        >
          <Link href={`/designer/${encodeURIComponent(slug)}/edit`}>
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
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
