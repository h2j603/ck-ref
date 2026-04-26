import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToBoardDialog } from "@/components/board/AddToBoardDialog";
import { NoteList } from "@/components/detail/NoteList";
import { OwnerActions } from "@/components/detail/OwnerActions";
import { RatingControl } from "@/components/detail/RatingControl";
import { RefLinks } from "@/components/detail/RefLinks";
import { NicknamePill } from "@/components/nickname-pill";
import { Badge } from "@/components/ui/badge";
import {
  fetchLinkedRefs,
  fetchNotes,
  fetchRef,
  fetchRefRatings,
} from "@/lib/queries";
import { publicImageUrl } from "@/lib/storage";

export default async function RefDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ref = await fetchRef(id).catch(() => null);
  if (!ref) notFound();

  const [notes, linked, ratings] = await Promise.all([
    fetchNotes(id).catch(() => []),
    fetchLinkedRefs(id).catch(() => []),
    fetchRefRatings(id).catch(() => []),
  ]);
  const url = publicImageUrl(ref.image_path);
  const w = ref.image_width ?? 4;
  const h = ref.image_height ?? 5;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <div className="relative w-full bg-muted" style={{ aspectRatio: `${w} / ${h}` }}>
          <Image
            src={url}
            alt={ref.title ?? "untitled"}
            fill
            sizes="(max-width: 1024px) 100vw, 70vw"
            className="object-contain"
            priority
          />
        </div>
      </div>

      <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-2">
        <section className="flex flex-col gap-3">
          <h1 className="text-xl font-medium tracking-tight">
            {ref.title ?? "untitled"}
          </h1>
          <RatingControl
            refId={ref.id}
            initialRatings={ratings.map((r) => ({
              user_key: r.user_key,
              stars: r.stars,
            }))}
          />
          <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            <Meta term="Designer">
              {ref.designers.length > 0 ? (
                <span className="text-foreground">
                  {ref.designers.map((d, i) => (
                    <span key={d.id}>
                      <Link href={`/designer/${d.slug}`} className="underline-offset-2 hover:underline">
                        {d.name}
                      </Link>
                      {i < ref.designers.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </span>
              ) : (
                "—"
              )}
            </Meta>
            <Meta term="Year">{ref.year ?? "—"}</Meta>
            <Meta term="Genre">{ref.genre ?? "—"}</Meta>
            <Meta term="Medium">{ref.medium ?? "—"}</Meta>
            <Meta term="Lang">
              {ref.languages.length > 0 ? ref.languages.join(", ") : "—"}
            </Meta>
            <Meta term="Source">
              {ref.source_url ? (
                <a
                  href={ref.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  link
                </a>
              ) : (
                "—"
              )}
            </Meta>
            <Meta term="Added">
              <span className="inline-flex items-center gap-2">
                {new Date(ref.created_at).toLocaleDateString("ko-KR")}
                <NicknamePill nickname={ref.created_by} />
              </span>
            </Meta>
          </dl>
          {ref.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-2">
              {ref.tags.map((tag) => (
                <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`}>
                  <Badge
                    variant="outline"
                    className="cursor-pointer font-mono text-[10px] tracking-wide"
                  >
                    #{tag}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <AddToBoardDialog refId={ref.id} />
            <OwnerActions
              refId={ref.id}
              imagePath={ref.image_path}
              createdBy={ref.created_by}
            />
          </div>
        </section>

        <RefLinks refId={ref.id} initial={linked} />
        <NoteList refId={ref.id} initialNotes={notes} />
      </aside>
    </div>
  );
}

function Meta({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt>{term}</dt>
      <dd className="normal-case tracking-normal text-foreground">{children}</dd>
    </>
  );
}
