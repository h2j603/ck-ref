"use client";

import Masonry from "react-masonry-css";

import { RefCard } from "./RefCard";
import { useColumnPref, type ColumnCount } from "@/lib/columnPref";
import type { RefSort, RefWithDesigners } from "@/lib/types";

// Honor the user's pick at every breakpoint — the column selector is the
// ground truth, even on phones.
function breakpointsFor(cols: ColumnCount) {
  return { default: cols };
}

export function MasonryGrid({
  refs,
  sort,
}: {
  refs: RefWithDesigners[];
  sort?: RefSort;
}) {
  const { columns } = useColumnPref();
  if (refs.length === 0) {
    return (
      <p className="py-32 text-center font-mono text-xs text-muted-foreground">
        아직 레퍼런스가 없습니다.
      </p>
    );
  }
  return (
    <Masonry
      breakpointCols={breakpointsFor(columns)}
      className="masonry-grid"
      columnClassName="masonry-grid_column"
    >
      {refs.map((ref) => (
        <RefCard key={ref.id} ref_={ref} sort={sort} />
      ))}
    </Masonry>
  );
}
