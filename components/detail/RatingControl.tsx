"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";

import { NicknamePill } from "@/components/nickname-pill";
import { useNickname } from "@/lib/nickname";
import { isProfileKey } from "@/lib/profiles";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Row = { user_key: string; stars: number };

export function RatingControl({
  refId,
  initialRatings,
}: {
  refId: string;
  initialRatings: Row[];
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [ratings, setRatings] = useState<Row[]>(initialRatings);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull fresh on mount in case the server data is stale (other users rated
  // since this page rendered).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("ref_ratings")
        .select("user_key, stars")
        .eq("ref_id", refId);
      if (!cancelled && !error && data) setRatings(data as Row[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, refId]);

  const myRow = nickname ? ratings.find((r) => r.user_key === nickname) : null;
  const myStars = myRow?.stars ?? 0;
  const count = ratings.length;
  const avg = count > 0 ? ratings.reduce((s, r) => s + r.stars, 0) / count : null;
  const displayed = hover ?? myStars;
  const canRate = hydrated && nickname && isProfileKey(nickname);

  async function setMy(stars: number) {
    if (!canRate || !nickname) return;
    setError(null);
    setBusy(true);
    if (stars === myStars) {
      // Tap the current rating to clear it.
      const { error } = await supabase
        .from("ref_ratings")
        .delete()
        .eq("ref_id", refId)
        .eq("user_key", nickname);
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      setRatings((prev) => prev.filter((r) => r.user_key !== nickname));
      return;
    }
    const { error } = await supabase
      .from("ref_ratings")
      .upsert(
        { ref_id: refId, user_key: nickname, stars, rated_at: new Date().toISOString() },
        { onConflict: "ref_id,user_key" },
      );
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRatings((prev) => {
      const others = prev.filter((r) => r.user_key !== nickname);
      return [...others, { user_key: nickname, stars }];
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div
          role={canRate ? "radiogroup" : undefined}
          aria-label="rating"
          className="flex items-center gap-0.5"
          onMouseLeave={() => setHover(null)}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = displayed >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setMy(n)}
                onMouseEnter={() => canRate && setHover(n)}
                disabled={!canRate || busy}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className={cn(
                  "p-0.5 transition-transform disabled:cursor-not-allowed",
                  canRate ? "hover:scale-110" : "cursor-default",
                )}
              >
                <Star
                  className={cn(
                    "size-5",
                    filled
                      ? "fill-lime-500 stroke-none"
                      : "stroke-muted-foreground",
                  )}
                />
              </button>
            );
          })}
        </div>
        <div className="font-mono text-[11px] uppercase tracking-wider tabular-nums text-muted-foreground">
          {avg !== null ? (
            <>
              <span className="text-foreground">{avg.toFixed(1)}</span> · {count}
            </>
          ) : (
            "no ratings"
          )}
        </div>
      </div>
      {!canRate ? (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          별점을 매기려면 /gate에서 로그인하세요
        </p>
      ) : myStars > 0 ? (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          내 별점 {myStars} · 다시 누르면 취소
        </p>
      ) : null}
      {ratings.length > 0 ? (
        <ul className="flex flex-col gap-1 pt-1">
          {[...ratings]
            .sort((a, b) => b.stars - a.stars || a.user_key.localeCompare(b.user_key))
            .map((r) => (
              <li
                key={r.user_key}
                className="flex items-center justify-between gap-2"
              >
                <NicknamePill nickname={r.user_key} />
                <MiniStars stars={r.stars} />
              </li>
            ))}
        </ul>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function MiniStars({ stars }: { stars: number }) {
  return (
    <span aria-label={`${stars} of 5`} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-3",
            stars >= n
              ? "fill-lime-500 stroke-none"
              : "stroke-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}
