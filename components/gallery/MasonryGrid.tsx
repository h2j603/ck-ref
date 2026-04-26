"use client";

import Masonry from "react-masonry-css";

import { RefCard } from "./RefCard";
import { useColumnPref, type ColumnCount } from "@/lib/columnPref";
import type { RefWithDesigners } from "@/lib/types";

// Mobile breakpoints scale the user's pick down so phones don't end up with
// 5 hairline columns.
function breakpointsFor(cols: ColumnCount) {
  return {
    default: cols,
    1536: cols,
    1280: Math.min(cols, 4),
    1024: Math.min(cols, 3),
    768: Math.min(cols, 2),
    480: Math.min(cols, 2),
  };
}

export function MasonryGrid({ refs }: { refs: RefWithDesigners[] }) {
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
        <RefCard key={ref.id} ref_={ref} />
      ))}
    </Masonry>
  );
}
