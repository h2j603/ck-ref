import Link from "next/link";
import { notFound } from "next/navigation";

import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { fetchDesignerBySlug, fetchRefs } from "@/lib/queries";

export default async function DesignerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const designer = await fetchDesignerBySlug(slug).catch(() => null);
  if (!designer) notFound();

  const refs = await fetchRefs({ designerId: designer.id }).catch(() => []);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-8">
      <header className="flex flex-col gap-2 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / designer
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-medium tracking-tight">
            {designer.name}
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {refs.length} ref{refs.length === 1 ? "" : "s"}
          </p>
        </div>
        <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {designer.origin ? (
            <>
              <dt>Origin</dt>
              <dd className="normal-case tracking-normal text-foreground">
                {designer.origin}
              </dd>
            </>
          ) : null}
          {designer.website ? (
            <>
              <dt>Web</dt>
              <dd className="normal-case tracking-normal text-foreground">
                <a
                  href={designer.website}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {designer.website}
                </a>
              </dd>
            </>
          ) : null}
        </dl>
        {designer.bio ? (
          <p className="max-w-2xl text-sm leading-relaxed text-foreground">
            {designer.bio}
          </p>
        ) : null}
        <div>
          <Link
            href="/designer"
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← all designers
          </Link>
        </div>
      </header>
      <MasonryGrid refs={refs} />
    </div>
  );
}
