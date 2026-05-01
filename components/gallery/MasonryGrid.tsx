"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import Masonry from "react-masonry-css";

import { RefCard } from "./RefCard";
import { loadMoreRefs } from "@/app/actions/refs";
import { useColumnPref, type ColumnCount } from "@/lib/columnPref";
import type { RefFilter } from "@/lib/queries";
import type { RefSort, RefWithDesigners } from "@/lib/types";

// Honor the user's pick at every breakpoint — the column selector is the
// ground truth, even on phones.
function breakpointsFor(cols: ColumnCount) {
  return { default: cols };
}

export function MasonryGrid({
  refs: initial,
  sort,
  filter,
  pageSize,
}: {
  refs: RefWithDesigners[];
  sort?: RefSort;
  // Filter object the page used for the initial fetch. Subsequent
  // pages re-apply the same filter to stay in scope.
  filter?: RefFilter;
  // Page size for "더 보기"; matches the initial fetch limit so a full
  // page implies more is available.
  pageSize?: number;
}) {
  const { columns } = useColumnPref();
  const [refs, setRefs] = useState(initial);
  // Shuffle returns a randomized slice — appending more pages by
  // created_at cursor would be meaningless and could even surface dupes
  // already in the shuffled set, so pagination is suppressed in that
  // mode. Re-rolling is done by selecting shuffle in the sort UI.
  const [hasMore, setHasMore] = useState(
    sort !== "shuffle" && pageSize != null && initial.length >= pageSize,
  );
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (!filter || !pageSize || pending || refs.length === 0) return;
    const last = refs[refs.length - 1];
    startTransition(async () => {
      const next = await loadMoreRefs(filter, last.created_at, pageSize);
      setRefs((prev) => {
        // Dedupe by id — protects against the rare cursor edge where
        // multiple refs share the exact created_at.
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const r of next) {
          if (!seen.has(r.id)) merged.push(r);
        }
        return merged;
      });
      setHasMore(next.length >= pageSize);
    });
  }

  if (refs.length === 0) {
    return (
      <p className="py-32 text-center font-mono text-xs text-muted-foreground">
        아직 레퍼런스가 없습니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <Masonry
        breakpointCols={breakpointsFor(columns)}
        className="masonry-grid"
        columnClassName="masonry-grid_column"
      >
        {refs.map((ref) => (
          <RefCard key={ref.id} ref_={ref} sort={sort} />
        ))}
      </Masonry>
      {hasMore ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-input px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="size-3 animate-spin" /> 불러오는 중
            </>
          ) : (
            "더 보기"
          )}
        </button>
      ) : null}
    </div>
  );
}
