import { Suspense } from "react";

import { ColumnSelector } from "@/components/gallery/ColumnSelector";
import { FilterBar } from "@/components/gallery/FilterBar";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { fetchAllTags, fetchRefs, type RefFilter } from "@/lib/queries";

type SearchParams = Promise<{
  genre?: string;
  medium?: string;
  language?: string;
  tag?: string | string[];
}>;

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const filter: RefFilter = {
    genre: sp.genre,
    medium: sp.medium,
    language: sp.language,
    tags: sp.tag ? (Array.isArray(sp.tag) ? sp.tag : [sp.tag]) : undefined,
  };

  const [refs, tags] = await Promise.all([
    fetchRefs(filter).catch(() => []),
    fetchAllTags().catch(() => []),
  ]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header className="flex items-center justify-between gap-4 pt-2">
        <h1 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Index — {refs.length} item{refs.length === 1 ? "" : "s"}
        </h1>
        <ColumnSelector />
      </header>
      <Suspense fallback={null}>
        <FilterBar allTags={tags} />
      </Suspense>
      <MasonryGrid refs={refs} />
    </div>
  );
}
