import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchRef } from "@/lib/queries";

import { EditRefForm } from "./EditRefForm";

export const metadata = { title: "Edit ref — CK Ref." };

export default async function EditRefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ref = await fetchRef(id).catch(() => null);
  if (!ref) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pt-2">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / ref / edit
        </p>
        <h1 className="text-2xl font-medium tracking-tight">레퍼런스 수정</h1>
        <Link
          href={`/ref/${ref.id}`}
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          ← back to ref
        </Link>
      </header>
      <EditRefForm
        refId={ref.id}
        createdBy={ref.created_by}
        initial={{
          title: ref.title,
          year: ref.year,
          source_url: ref.source_url,
          genre: ref.genre,
          medium: ref.medium,
          languages: ref.languages,
          tags: ref.tags,
          designers: ref.designers,
          image_path: ref.image_path,
          image_width: ref.image_width,
          image_height: ref.image_height,
        }}
      />
    </div>
  );
}
