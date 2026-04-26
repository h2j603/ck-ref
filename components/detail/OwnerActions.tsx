"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { STORAGE_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

export function OwnerActions({
  refId,
  imagePath,
  createdBy,
}: {
  refId: string;
  imagePath: string;
  createdBy: string | null;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return null;
  if (!createdBy || !nickname || nickname !== createdBy) return null;

  async function handleDelete() {
    if (!window.confirm("이 레퍼런스를 삭제할까요? 되돌릴 수 없어요.")) return;
    setError(null);
    setBusy(true);
    // Delete storage object first; notes & ref_designers cascade via FK.
    const { error: storageErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([imagePath]);
    if (storageErr) {
      setError(storageErr.message);
      setBusy(false);
      return;
    }
    const { error: dbErr } = await supabase.from("refs").delete().eq("id", refId);
    if (dbErr) {
      setError(dbErr.message);
      setBusy(false);
      return;
    }
    window.location.assign("/");
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
          <Link href={`/ref/${refId}/edit`}>
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
