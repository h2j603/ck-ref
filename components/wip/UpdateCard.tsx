"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { NoteList } from "@/components/detail/NoteList";
import { MarkdownWithMentions } from "@/components/mentioned-text";
import { NicknamePill } from "@/components/nickname-pill";
import { useNickname } from "@/lib/nickname";
import { relativeTime } from "@/lib/relativeTime";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { ProjectUpdate } from "@/lib/types";

export function UpdateCard({ update }: { update: ProjectUpdate }) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const w = update.image_width ?? 4;
  const h = update.image_height ?? 5;
  const isMine = hydrated && nickname && nickname === update.created_by;

  async function handleDelete() {
    if (
      !window.confirm(
        "이 업데이트를 삭제할까요? 노트와 답글도 함께 사라져요.",
      )
    )
      return;
    setError(null);
    setBusy(true);
    const { data, error } = await supabase
      .from("project_updates")
      .delete()
      .eq("id", update.id)
      .select("id");
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setError("삭제되지 않았어요.");
      return;
    }
    setDeleted(true);
  }

  if (deleted) return null;

  return (
    <article className="flex flex-col gap-3 border-b border-border/40 pb-6 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <NicknamePill nickname={update.created_by} />
          <span>{relativeTime(update.created_at)}</span>
        </div>
        {isMine ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="text-muted-foreground hover:text-destructive disabled:opacity-40"
            aria-label="delete update"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div
        className="relative w-full overflow-hidden bg-muted"
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        <Image
          src={publicImageUrl(update.image_path)}
          alt={update.body ?? "update"}
          fill
          sizes="(max-width: 1024px) 100vw, 720px"
          className="object-contain"
        />
      </div>
      {update.body ? (
        <div className="prose prose-sm prose-neutral max-w-none text-sm leading-relaxed">
          <MarkdownWithMentions text={update.body} />
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="rounded-md border border-border/40 bg-muted/30 p-3">
        <NoteList
          target={{ kind: "project_update", id: update.id }}
          initialNotes={[]}
        />
      </div>
    </article>
  );
}
