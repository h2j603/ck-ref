import Link from "next/link";
import { notFound } from "next/navigation";

import { ColumnSelector } from "@/components/gallery/ColumnSelector";
import { MasonryGrid } from "@/components/gallery/MasonryGrid";
import { fetchProfiles, fetchRefs } from "@/lib/queries";
import { findProfile, isProfileKey } from "@/lib/profiles";
import { publicImageUrl } from "@/lib/storage";

export default async function UserPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  if (!isProfileKey(key)) notFound();

  const [profiles, refs] = await Promise.all([
    fetchProfiles(),
    fetchRefs({ userKey: key }).catch(() => []),
  ]);
  const profile = findProfile(profiles, key);
  if (!profile) notFound();

  const avatar = profile.avatar_path ? publicImageUrl(profile.avatar_path) : null;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-8">
      <header className="flex flex-col gap-3 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / user
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex size-12 items-center justify-center overflow-hidden rounded-2xl border bg-cover bg-center text-lg font-medium text-foreground"
              style={{
                backgroundColor: avatar ? undefined : profile.color,
                backgroundImage: avatar ? `url(${avatar})` : undefined,
              }}
            >
              {avatar ? "" : profile.display_name.slice(0, 1)}
            </span>
            <h1 className="text-2xl font-medium tracking-tight">
              @{profile.display_name}
            </h1>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {refs.length} ref{refs.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← back to index
          </Link>
          <ColumnSelector />
        </div>
      </header>
      <MasonryGrid refs={refs} />
    </div>
  );
}
