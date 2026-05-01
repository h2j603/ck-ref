import Link from "next/link";
import { notFound } from "next/navigation";

import { AddToBoardDialog } from "@/components/board/AddToBoardDialog";
import { AnnotationLayer } from "@/components/detail/AnnotationLayer";
import { GridAnalyzer } from "@/components/detail/GridAnalyzer";
import { NoteList } from "@/components/detail/NoteList";
import { OwnerActions } from "@/components/detail/OwnerActions";
import { RatingControl } from "@/components/detail/RatingControl";
import { RefLinks } from "@/components/detail/RefLinks";
import { SimilarRefs } from "@/components/detail/SimilarRefs";
import { NicknamePill } from "@/components/nickname-pill";
import { Badge } from "@/components/ui/badge";

import {
  fetchLinkedRefs,
  fetchNotes,
  fetchProfiles,
  fetchRef,
  fetchRefAnnotations,
  fetchRefExtraImages,
  fetchRefGrids,
  fetchRefImageAnnotations,
  fetchRefRatings,
  fetchSimilarRefs,
} from "@/lib/queries";
import { isVideoPath } from "@/lib/media";
import { publicImageUrl } from "@/lib/storage";

export default async function RefDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ref = await fetchRef(id).catch(() => null);
  if (!ref) notFound();

  const [notes, linked, ratings, similar, annotations, profiles, extras, grids] =
    await Promise.all([
      fetchNotes(id).catch(() => []),
      fetchLinkedRefs(id).catch(() => []),
      fetchRefRatings(id).catch(() => []),
      fetchSimilarRefs(id).catch(() => []),
      fetchRefAnnotations(id).catch(() => []),
      fetchProfiles().catch(() => []),
      fetchRefExtraImages(id).catch(() => []),
      fetchRefGrids(id).catch(() => []),
    ]);
  const extraAnnotations = await fetchRefImageAnnotations(
    extras.map((e) => e.id),
  ).catch(() => ({}) as Record<string, never>);
  const url = publicImageUrl(ref.image_path);
  const w = ref.image_width ?? 4;
  const h = ref.image_height ?? 5;
  const coverIsVideo = isVideoPath(ref.image_path);
  // Both poster and editorial design lean heavily on structural grids,
  // so the grid analyzer + composition grid presets surface for either.
  const gridApplicable =
    ref.genres.includes("poster") || ref.genres.includes("editorial");
  // Source list for GridAnalyzer — cover (if not video) plus any extras
  // that aren't videos. We need at least one to render the analyzer.
  const gridImages = [
    ...(coverIsVideo
      ? []
      : [
          {
            path: null as string | null,
            storagePath: ref.image_path,
            url,
            width: w,
            height: h,
            label: "커버",
          },
        ]),
    ...extras
      .filter((e) => !isVideoPath(e.image_path))
      .map((e, i) => ({
        path: e.image_path as string | null,
        storagePath: e.image_path,
        url: publicImageUrl(e.image_path),
        width: e.image_width ?? 4,
        height: e.image_height ?? 5,
        label: `이미지 ${i + 2}`,
      })),
  ];

  return (
    <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        {coverIsVideo ? (
          <div
            className="relative w-full overflow-hidden rounded-md bg-muted"
            style={{ aspectRatio: `${w} / ${h}` }}
          >
            {/* Annotations don't apply to motion content; just play the
                file with the standard browser controls. */}
            <video
              src={url}
              className="absolute inset-0 h-full w-full"
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          </div>
        ) : (
          <AnnotationLayer
            target={{ kind: "ref", id: ref.id }}
            imageUrl={url}
            alt={ref.title ?? "untitled"}
            width={w}
            height={h}
            initial={annotations}
            profiles={profiles}
            sourceUrl={ref.source_url}
          />
        )}
        {extras.length > 0 ? (
          <div className="flex flex-col gap-4">
            {extras.map((img, i) => {
              const ew = img.image_width ?? 4;
              const eh = img.image_height ?? 5;
              if (isVideoPath(img.image_path)) {
                return (
                  <div
                    key={img.id}
                    className="relative w-full overflow-hidden rounded-md bg-muted"
                    style={{ aspectRatio: `${ew} / ${eh}` }}
                  >
                    <video
                      src={publicImageUrl(img.image_path)}
                      className="absolute inset-0 h-full w-full"
                      controls
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  </div>
                );
              }
              return (
                <AnnotationLayer
                  key={img.id}
                  target={{ kind: "ref_image", id: img.id }}
                  imageUrl={publicImageUrl(img.image_path)}
                  alt={`${ref.title ?? "untitled"} ${i + 2}`}
                  width={ew}
                  height={eh}
                  initial={extraAnnotations[img.id] ?? []}
                  profiles={profiles}
                  sourceUrl={ref.source_url}
                />
              );
            })}
          </div>
        ) : null}
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
            <Meta term="Genre">
              {ref.genres.length > 0 ? ref.genres.join(", ") : "—"}
            </Meta>
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
        {gridApplicable && gridImages.length > 0 ? (
          <GridAnalyzer
            refId={ref.id}
            images={gridImages}
            initial={grids}
          />
        ) : null}
        <SimilarRefs refs={similar} />
        <NoteList
          target={{ kind: "ref", id: ref.id }}
          initialNotes={notes}
          profiles={profiles}
          gridApplicable={gridApplicable}
        />
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
