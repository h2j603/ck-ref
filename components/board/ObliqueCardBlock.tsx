"use client";

import { Plus, RotateCw, Shuffle, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import {
  findObliqueCard,
  pickObliqueCard,
  type ObliqueCard,
} from "@/lib/oblique";
import { createClient } from "@/lib/supabase/client";

// Brian Eno / Peter Schmidt's deck. Pinning works in two stages so the
// owner can re-roll a draw before committing it to the board: a private
// "preview" sits on top while they decide, and only "이 카드 추가"
// promotes it to the persistent oblique_cards array. Each pinned card
// reads as a bilingual block; viewers see whatever is pinned but can't
// draw or remove.
export function ObliqueCardBlock({
  boardId,
  createdBy,
  initial,
}: {
  boardId: string;
  createdBy: string | null;
  initial: string[];
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [cards, setCards] = useState<string[]>(initial);
  const [preview, setPreview] = useState<ObliqueCard | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = hydrated && nickname && nickname === createdBy;

  async function persist(next: string[]) {
    setBusy(true);
    const { error } = await supabase
      .from("boards")
      .update({ oblique_cards: next })
      .eq("id", boardId);
    setBusy(false);
    if (error) {
      console.error("oblique update failed", error);
      return;
    }
    setCards(next);
  }

  function draw() {
    setPreview(pickObliqueCard(cards));
  }

  function reroll() {
    setPreview(pickObliqueCard([...cards, ...(preview ? [preview.en] : [])]));
  }

  async function commit() {
    if (!preview) return;
    const next = [...cards, preview.en];
    setPreview(null);
    await persist(next);
  }

  async function remove(en: string) {
    await persist(cards.filter((c) => c !== en));
  }

  if (cards.length === 0 && !isOwner) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          oblique strategies
        </p>
        {isOwner && !preview ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={draw}
            disabled={busy}
            className="h-7 px-2 text-[11px]"
          >
            <Shuffle className="size-3" />
            {cards.length === 0 ? "한 장 뽑기" : "또 뽑기"}
          </Button>
        ) : null}
      </div>

      {preview ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-foreground/40 bg-muted/40 p-4">
          <p className="text-base italic leading-snug">{preview.en}</p>
          {preview.ko ? (
            <p className="text-sm leading-snug text-muted-foreground">
              {preview.ko}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void commit()}
              disabled={busy}
              className="h-7 px-3 text-[11px]"
            >
              <Plus className="size-3" /> 이 카드 추가
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reroll}
              disabled={busy}
              className="h-7 px-3 text-[11px]"
            >
              <RotateCw className="size-3" /> 다시 뽑기
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPreview(null)}
              disabled={busy}
              className="h-7 px-2 text-[11px] text-muted-foreground"
            >
              버리기
            </Button>
          </div>
        </div>
      ) : null}

      {cards.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {cards.map((en) => {
            const card = findObliqueCard(en);
            return (
              <li
                key={en}
                className="flex items-start justify-between gap-3 rounded-md border-l-2 border-foreground/40 bg-muted/40 px-4 py-3"
              >
                <div className="flex flex-col gap-0.5">
                  <p className="text-base italic leading-snug">{card.en}</p>
                  {card.ko ? (
                    <p className="text-sm leading-snug text-muted-foreground">
                      {card.ko}
                    </p>
                  ) : null}
                </div>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => void remove(en)}
                    disabled={busy}
                    aria-label="remove"
                    className="rounded-full p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : isOwner && !preview ? (
        <p className="text-xs text-muted-foreground">
          Brian Eno의 100여 장짜리 prompt 카드를 뽑아 보드에 박아두세요. 시각
          inspiration이 막힐 때 옆에서 찌르는 한 줄.
        </p>
      ) : null}
    </section>
  );
}
