import Link from "next/link";

import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { fetchRefs } from "@/lib/queries";

export default async function TagPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const tag = decodeURIComponent(name);
  const refs = await fetchRefs({ tags: [tag] }).catch(() => []);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
      <header className="flex flex-col gap-1 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / tag
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-mono text-2xl font-medium tracking-tight">
            #{tag}
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {refs.length} ref{refs.length === 1 ? "" : "s"}
          </p>
        </div>
        <div>
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← back to index
          </Link>
        </div>
      </header>
      <MasonryGrid refs={refs} />
    </div>
  );
}
