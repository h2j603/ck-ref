"use client";

import { Shuffle, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { pickObliqueCard } from "@/lib/oblique";
import { createClient } from "@/lib/supabase/client";

// Brian Eno / Peter Schmidt's deck as a single "card" persisted on the
// board. The point isn't to roll endlessly — you draw one, sit with it,
// re-roll only when the current one stops nudging. Editing is gated to
// the board owner; viewers see whatever card is currently up.
export function ObliqueCardBlock({
  boardId,
  createdBy,
  initial,
}: {
  boardId: string;
  createdBy: string | null;
  initial: string | null;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [card, setCard] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);
  const isOwner = hydrated && nickname && nickname === createdBy;

  async function persist(next: string | null) {
    setBusy(true);
    const { error } = await supabase
      .from("boards")
      .update({ oblique_card: next })
      .eq("id", boardId);
    setBusy(false);
    if (error) {
      // Soft failure — the deck is a creative aid, not a critical path.
      // Reset state to the previous card so the UI doesn't lie.
      console.error("oblique update failed", error);
      return;
    }
    setCard(next);
  }

  async function roll() {
    await persist(pickObliqueCard(card));
  }

  if (!card && !isOwner) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          oblique strategy
        </p>
        {isOwner ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void roll()}
              disabled={busy}
              className="h-7 px-2 text-[11px]"
            >
              <Shuffle className="size-3" />
              {card ? "다시 뽑기" : "한 장 뽑기"}
            </Button>
            {card ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void persist(null)}
                disabled={busy}
                aria-label="제거"
                className="h-7 px-2 text-muted-foreground"
              >
                <X className="size-3" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {card ? (
        <blockquote className="rounded-md border-l-2 border-foreground/40 bg-muted/40 px-4 py-3 text-base italic leading-snug">
          {card}
        </blockquote>
      ) : (
        <p className="text-xs text-muted-foreground">
          Brian Eno의 100여 장짜리 prompt 카드 중 한 장을 뽑아 보드에
          박아두세요. 시각 inspiration이 막힐 때 옆에서 찌르는 한 줄.
        </p>
      )}
    </section>
  );
}
