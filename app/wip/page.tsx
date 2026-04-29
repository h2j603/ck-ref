import Link from "next/link";

import { WipCard } from "@/components/wip/WipCard";
import { fetchProjects } from "@/lib/queries";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "WIP — CK Ref.",
};

const STATUS_LABELS: Record<ProjectStatus | "all", string> = {
  all: "전체",
  planning: "기획",
  in_progress: "진행 중",
  done: "완료",
};

type SearchParams = Promise<{ status?: string }>;

export default async function WipIndexPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const active = (PROJECT_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as ProjectStatus)
    : null;
  const projects = await fetchProjects(
    active ? { status: active } : undefined,
  ).catch(() => []);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h1 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          WIP — {projects.length}
        </h1>
        <div className="flex items-center gap-2">
          <FilterChip
            label={STATUS_LABELS.all}
            href="/wip"
            active={active === null}
          />
          {PROJECT_STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={STATUS_LABELS[s]}
              href={`/wip?status=${s}`}
              active={active === s}
            />
          ))}
          <Link
            href="/wip/new"
            className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            + new
          </Link>
        </div>
      </header>

      {projects.length === 0 ? (
        <p className="py-32 text-center font-mono text-xs text-muted-foreground">
          아직 진행 중인 작업이 없습니다.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <li key={p.id}>
              <WipCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
