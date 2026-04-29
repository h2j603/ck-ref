import Image from "next/image";
import Link from "next/link";

import { NicknamePill } from "@/components/nickname-pill";
import { StatusBadge } from "@/components/wip/StatusBadge";
import type { ProjectSummary } from "@/lib/queries";
import { readPlanning } from "@/lib/queries";
import { publicImageUrl } from "@/lib/storage";

export function WipCard({ project }: { project: ProjectSummary }) {
  const planning = readPlanning(project.planning);
  const isPlanning = project.status === "planning";
  return (
    <Link
      href={`/wip/${project.id}`}
      className="flex flex-col gap-2 transition-opacity hover:opacity-90"
    >
      <div
        className="relative w-full overflow-hidden rounded-md bg-muted"
        style={{
          aspectRatio: project.cover
            ? `${project.cover.image_width ?? 4} / ${project.cover.image_height ?? 5}`
            : "4 / 5",
        }}
      >
        {project.cover ? (
          <Image
            src={publicImageUrl(project.cover.image_path)}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, 320px"
            className="object-cover"
          />
        ) : isPlanning && planning.concept ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm italic leading-snug text-muted-foreground">
            {planning.concept}
          </p>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {isPlanning ? "planning" : "no updates yet"}
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-medium leading-tight">
          {project.title}
        </h3>
        <p className="font-mono text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground">
          {project.update_count}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={project.status} />
        <NicknamePill nickname={project.created_by} link={false} />
      </div>
    </Link>
  );
}
