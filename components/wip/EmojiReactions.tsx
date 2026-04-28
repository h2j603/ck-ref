"use client";

import { SmilePlus } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNickname } from "@/lib/nickname";
import type { Profile } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/client";
import type { UpdateReaction } from "@/lib/types";
import { cn } from "@/lib/utils";

const PALETTE = [
  "🔥",
  "❤️",
  "👀",
  "✨",
  "👏",
  "💯",
  "🤔",
  "💡",
  "🥲",
  "🎨",
  "😭",
  "🤩",
] as const;

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
  const [pickerOpen, setPickerOpen] = useState(false);

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

  // Group existing reactions by emoji. Only emojis that actually have
  // someone reacting render as chips; the picker is the entry point for
  // adding a new emoji type.
  const byEmoji = new Map<string, UpdateReaction[]>();
  for (const r of reactions) {
    const list = byEmoji.get(r.emoji) ?? [];
    list.push(r);
    byEmoji.set(r.emoji, list);
  }
  const activeEmojis = Array.from(byEmoji.keys());
  const canReact = hydrated && !!nickname;

  // Hide the row entirely when there's nothing to show and the user can't
  // react — keeps the card clean for visitors without a nickname set.
  if (activeEmojis.length === 0 && !canReact) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeEmojis.map((emoji) => {
        const list = byEmoji.get(emoji) ?? [];
        const mine = nickname
          ? list.some((r) => r.user_key === nickname)
          : false;
        const reactors = list.map((r) => displayName(r.user_key)).join(", ");
        return (
          <button
            key={emoji}
            type="button"
            disabled={!canReact}
            onClick={() => toggle(emoji)}
            aria-label={`${emoji} ${reactors}`}
            aria-pressed={mine}
            title={reactors}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-none transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-60",
              mine
                ? "border-foreground/40 bg-foreground/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span className="font-mono tabular-nums">{list.length}</span>
          </button>
        );
      })}
      {canReact ? (
        <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="이모지 추가"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <SmilePlus className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="grid grid-cols-6 gap-1 p-1"
          >
            {PALETTE.map((emoji) => {
              const list = byEmoji.get(emoji) ?? [];
              const mine = list.some((r) => r.user_key === nickname);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    void toggle(emoji);
                    setPickerOpen(false);
                  }}
                  aria-label={emoji}
                  aria-pressed={mine}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded text-lg leading-none transition-colors",
                    mine ? "bg-foreground/10" : "hover:bg-muted",
                  )}
                >
                  {emoji}
                </button>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
