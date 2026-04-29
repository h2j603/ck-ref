import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchProject } from "@/lib/queries";

import { EditProjectForm } from "./EditProjectForm";

export const metadata = { title: "Edit WIP — KIWI Juice" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await fetchProject(id).catch(() => null);
  if (!project) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 pt-2">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / wip / edit
        </p>
        <h1 className="text-2xl font-medium tracking-tight">작업 수정</h1>
        <Link
          href={`/wip/${project.id}`}
          className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          ← back to wip
        </Link>
      </header>
      <EditProjectForm
        projectId={project.id}
        createdBy={project.created_by}
        initial={{
          title: project.title,
          status: project.status,
        }}
      />
    </div>
  );
}
