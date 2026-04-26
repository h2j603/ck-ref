import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchDesignerBySlug } from "@/lib/queries";

import { EditDesignerForm } from "./EditDesignerForm";

export const metadata = { title: "Edit designer — CK Ref." };

export default async function EditDesignerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const designer = await fetchDesignerBySlug(slug).catch(() => null);
  if (!designer) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-2">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          CK Ref. / designer / edit
        </p>
        <h1 className="text-2xl font-medium tracking-tight">디자이너 수정</h1>
        <Link
          href={`/designer/${encodeURIComponent(designer.slug)}`}
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          ← back to designer
        </Link>
      </header>
      <EditDesignerForm
        designerId={designer.id}
        slug={designer.slug}
        createdBy={designer.created_by}
        initial={{
          name: designer.name,
          origin: designer.origin,
          website: designer.website,
          bio: designer.bio,
        }}
      />
    </div>
  );
}
