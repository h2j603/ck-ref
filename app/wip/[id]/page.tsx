import Link from "next/link";
import { notFound } from "next/navigation";

import { NoteList } from "@/components/detail/NoteList";
import { MarkdownWithMentions } from "@/components/mentioned-text";
import { NicknamePill } from "@/components/nickname-pill";
import { AddUpdateForm } from "@/components/wip/AddUpdateForm";
import { InspirationRefs } from "@/components/wip/InspirationRefs";
import { PlanningSections } from "@/components/wip/PlanningSections";
import { PositioningMaps } from "@/components/wip/PositioningMaps";
import { ProjectOwnerActions } from "@/components/wip/ProjectOwnerActions";
import { StatusBadge } from "@/components/wip/StatusBadge";
import { UpdateCard } from "@/components/wip/UpdateCard";
import {
  fetchNotesFor,
  fetchProfiles,
  fetchProject,
  fetchProjectInspirationRefs,
  fetchProjectMilestones,
  fetchProjectPositioningMaps,
  fetchProjectUpdates,
  fetchUpdateReactions,
  readPlanning,
} from "@/lib/queries";

export default async function WipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await fetchProject(id).catch(() => null);
  if (!project) notFound();

  const [
    updates,
    projectNotes,
    inspiration,
    profiles,
    positioningMaps,
    milestones,
  ] = await Promise.all([
    fetchProjectUpdates(id).catch(() => []),
    fetchNotesFor({ kind: "project", id }).catch(() => []),
    fetchProjectInspirationRefs(id).catch(() => []),
    fetchProfiles().catch(() => []),
    fetchProjectPositioningMaps(id).catch(() => []),
    fetchProjectMilestones(id).catch(() => []),
  ]);
  const reactionsByUpdate = await fetchUpdateReactions(
    updates.map((u) => u.id),
  ).catch(() => new Map());
  const planning = readPlanning(project.planning);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 pb-12">
      <header className="flex flex-col gap-3 pt-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / wip
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-medium tracking-tight">
            {project.title}
          </h1>
          <StatusBadge status={project.status} />
        </div>
        {planning.concept ? (
          <p className="text-base italic text-muted-foreground">
            {planning.concept}
          </p>
        ) : null}
        {project.description ? (
          <div className="prose prose-sm prose-neutral max-w-none text-foreground">
            <MarkdownWithMentions text={project.description} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <NicknamePill nickname={project.created_by} />
          <ProjectOwnerActions
            projectId={project.id}
            status={project.status}
            createdBy={project.created_by}
          />
        </div>
        <div>
          <Link
            href="/wip"
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            ← all wip
          </Link>
        </div>
      </header>

      <PlanningSections
        projectId={project.id}
        createdBy={project.created_by}
        initial={planning}
        profiles={profiles}
        initialUpdatedAt={project.planning_updated_at}
        initialUpdatedBy={project.planning_updated_by}
        initialMilestones={milestones}
      />

      <PositioningMaps
        projectId={project.id}
        createdBy={project.created_by}
        initial={positioningMaps.map((m) => ({
          id: m.id,
          name: m.name,
          position: m.position,
          axes: {
            x_low_label: m.x_low_label,
            x_high_label: m.x_high_label,
            y_low_label: m.y_low_label,
            y_high_label: m.y_high_label,
          },
          points: m.points.map((p) => ({
            id: p.id,
            ref_id: p.ref_id,
            label: p.label,
            x: p.x,
            y: p.y,
            is_self: p.is_self,
            color: p.color,
            ref: p.ref
              ? {
                  id: p.ref.id,
                  title: p.ref.title,
                  image_path: p.ref.image_path,
                  image_width: p.ref.image_width,
                  image_height: p.ref.image_height,
                  color_hex: p.ref.color_hex,
                }
              : null,
          })),
        }))}
        inspirationRefs={inspiration.map((r) => ({
          id: r.id,
          title: r.title,
          image_path: r.image_path,
          image_width: r.image_width,
          image_height: r.image_height,
          color_hex: r.color_hex,
        }))}
      />

      <InspirationRefs
        projectId={project.id}
        initial={inspiration.map((r) => ({
          id: r.id,
          title: r.title,
          image_path: r.image_path,
          image_width: r.image_width,
          image_height: r.image_height,
          reason: r.reason,
          added_by: r.added_by,
        }))}
      />

      <section className="flex flex-col gap-4">
        <header className="border-b border-border/60 pb-2">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            프로젝트 토론
          </h2>
        </header>
        <NoteList
          target={{ kind: "project", id: project.id }}
          initialNotes={projectNotes}
          profiles={profiles}
        />
      </section>

      <section className="flex flex-col gap-6">
        <header className="flex items-center justify-between border-b border-border/60 pb-2">
          <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            업데이트 — {updates.length}
          </h2>
        </header>
        <AddUpdateForm projectId={project.id} />
        {updates.length === 0 ? (
          <p className="py-8 text-center font-mono text-xs text-muted-foreground">
            첫 업데이트를 올려보세요.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {updates.map((u) => (
              <UpdateCard
                key={u.id}
                update={u}
                profiles={profiles}
                initialReactions={reactionsByUpdate.get(u.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
