"use client";

import Image from "next/image";
import Link from "next/link";

import { RatingDisplay } from "./RatingDisplay";
import { isVideoPath } from "@/lib/media";
import { publicImageUrl } from "@/lib/storage";
import type { RefSort, RefWithDesigners } from "@/lib/types";

// What sits under each image is sort-dependent on the home grid:
//   - latest → nothing (the image alone, like a Pinterest feed)
//   - rating → rating stars
//   - year_*  → 작업연도
// Other gallery pages (tag, designer, user) don't pass `sort` so they
// keep showing the rating row by default.
export function RefCard({
  ref_,
  sort,
}: {
  ref_: RefWithDesigners;
  sort?: RefSort;
}) {
  const url = publicImageUrl(ref_.image_path);
  const isVideo = isVideoPath(ref_.image_path);
  // Fall back to a sane aspect when image dimensions are missing.
  const w = ref_.image_width ?? 4;
  const h = ref_.image_height ?? 5;

  return (
    <Link href={`/ref/${ref_.id}`} className="group block">
      <div className="relative overflow-hidden bg-muted">
        <div className="relative w-full" style={{ aspectRatio: `${w} / ${h}` }}>
          {isVideo ? (
            // Looping muted preview keeps the grid quiet but alive —
            // mirrors how Are.na / Pinterest treat motion content.
            <video
              src={url}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <Image
              src={url}
              alt={ref_.title ?? "untitled"}
              fill
              sizes="(max-width: 480px) 50vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
              className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            />
          )}
        </div>
        {ref_.extra_image_count > 0 ? (
          <span
            aria-label={`${ref_.extra_image_count + 1} images`}
            className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white"
          >
            +{ref_.extra_image_count}
          </span>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/0 to-black/0 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex flex-col gap-0.5 text-white">
            <p className="font-mono text-[11px] uppercase tracking-wide opacity-80">
              {ref_.designers.length > 0
                ? ref_.designers.map((d) => d.name).join(", ")
                : "—"}
            </p>
            <p className="text-[12px] font-medium leading-tight">
              {ref_.title ?? "untitled"}
              {ref_.year ? ` · ${ref_.year}` : ""}
            </p>
          </div>
        </div>
      </div>
      <CardFooter ref_={ref_} sort={sort} />
    </Link>
  );
}

function CardFooter({
  ref_,
  sort,
}: {
  ref_: RefWithDesigners;
  sort?: RefSort;
}) {
  if (sort === "latest") return null;
  if (sort === "year_desc" || sort === "year_asc") {
    return (
      <p className="px-1 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
        {ref_.year ?? "—"}
      </p>
    );
  }
  // rating, or no explicit sort (tag / designer / user pages)
  return (
    <RatingDisplay
      avg={ref_.rating_avg}
      count={ref_.rating_count}
      className="px-1 py-1.5"
    />
  );
}
