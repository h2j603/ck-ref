import Image from "next/image";
import Link from "next/link";

import { isVideoPath } from "@/lib/media";
import { publicImageUrl } from "@/lib/storage";
import type { RefWithDesigners } from "@/lib/types";

export function SimilarRefs({ refs }: { refs: RefWithDesigners[] }) {
  if (refs.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <header className="border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Similar — {refs.length}
        </h2>
      </header>
      <ul className="grid grid-cols-3 gap-2">
        {refs.map((r) => (
          <li key={r.id}>
            <Link
              href={`/ref/${r.id}`}
              className="block overflow-hidden bg-muted"
              aria-label={r.title ?? "similar ref"}
            >
              <div
                className="relative w-full"
                style={{
                  aspectRatio: `${r.image_width ?? 4} / ${r.image_height ?? 5}`,
                }}
              >
                {isVideoPath(r.image_path) ? (
                  // Mirror RefCard: looping muted preview keeps the
                  // similar grid quiet but alive without forcing a click.
                  <video
                    src={publicImageUrl(r.image_path)}
                    className="absolute inset-0 h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <Image
                    src={publicImageUrl(r.image_path)}
                    alt={r.title ?? "similar ref"}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
