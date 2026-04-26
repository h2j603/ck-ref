"use client";

import Masonry from "react-masonry-css";

import { RefCard } from "./RefCard";
import type { RefWithDesigners } from "@/lib/types";

const BREAKPOINTS = {
  default: 5,
  1536: 4,
  1280: 4,
  1024: 3,
  768: 2,
  480: 2,
};

export function MasonryGrid({ refs }: { refs: RefWithDesigners[] }) {
  if (refs.length === 0) {
    return (
      <p className="py-32 text-center font-mono text-xs text-muted-foreground">
        아직 레퍼런스가 없습니다.
      </p>
    );
  }
  return (
    <Masonry
      breakpointCols={BREAKPOINTS}
      className="masonry-grid"
      columnClassName="masonry-grid_column"
    >
      {refs.map((ref) => (
        <RefCard key={ref.id} ref_={ref} />
      ))}
    </Masonry>
  );
}
