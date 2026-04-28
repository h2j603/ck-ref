"use client";

import { useState } from "react";

import { useNickname } from "@/lib/nickname";
import type { Profile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/client";
import type { UpdateReaction } from "@/lib/types";
import { cn } from "@/lib/utils";

const PALETTE = ["🔥", "❤️", "👀", "✨", "👏"] as const;

export function EmojiReactions({
  updateId,
  initial,
  profiles,
}: {
  updateId: string;
  initial: UpdateReaction[];
  profiles: Profile[];
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [reactions, setReactions] = useState<UpdateReaction[]>(initial);

  const displayName = (key: string) =>
    profiles.find((p) => p.key === key)?.display_name ?? key;

  async function toggle(emoji: string) {
    if (!nickname) return;
    const mine = reactions.find(
      (r) => r.emoji === emoji && r.user_key === nickname,
    );
    if (mine) {
      const prev = reactions;
      setReactions((rs) =>
        rs.filter(
          (r) => !(r.emoji === emoji && r.user_key === nickname),
        ),
      );
      const { error } = await supabase
        .from("update_reactions")
        .delete()
        .eq("project_update_id", updateId)
        .eq("user_key", nickname)
        .eq("emoji", emoji);
      if (error) setReactions(prev);
    } else {
      const optimistic: UpdateReaction = {
        project_update_id: updateId,
        user_key: nickname,
        emoji,
        reacted_at: new Date().toISOString(),
      };
      const prev = reactions;
      setReactions((rs) => [...rs, optimistic]);
      const { error } = await supabase
        .from("update_reactions")
        .insert(optimistic);
      if (error) setReactions(prev);
    }
  }

  // Group by emoji once; PALETTE drives display order so empty buckets keep
  // their slot and the bar is visually stable as people react.
  const byEmoji = new Map<string, UpdateReaction[]>();
  for (const r of reactions) {
    const list = byEmoji.get(r.emoji) ?? [];
    list.push(r);
    byEmoji.set(r.emoji, list);
  }
  const extraEmojis = Array.from(byEmoji.keys()).filter(
    (e) => !PALETTE.includes(e as (typeof PALETTE)[number]),
  );
  const ordered = [...PALETTE, ...extraEmojis];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ordered.map((emoji) => {
        const list = byEmoji.get(emoji) ?? [];
        const mine = nickname
          ? list.some((r) => r.user_key === nickname)
          : false;
        const count = list.length;
        const reactors = list.map((r) => displayName(r.user_key)).join(", ");
        const empty = count === 0;
        return (
          <button
            key={emoji}
            type="button"
            disabled={!hydrated || !nickname}
            onClick={() => toggle(emoji)}
            aria-label={
              count > 0
                ? `${emoji} ${reactors}`
                : `${emoji} 리액션 추가`
            }
            aria-pressed={mine}
            title={count > 0 ? reactors : undefined}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-40",
              mine
                ? "border-foreground/40 bg-foreground/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              empty && !mine && "opacity-60",
            )}
          >
            <span className="text-sm leading-none">{emoji}</span>
            {count > 0 ? (
              <span className="font-mono tabular-nums">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
