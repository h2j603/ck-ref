"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { ProjectGrid } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<ProjectGrid["grid_type"], string> = {
  columnar: "단순 칼럼",
  modular: "모듈러",
  manuscript: "매뉴스크립트",
  custom: "수동 라인",
};

// Read-only preview of grids copied into a project from refs. The project
// itself doesn't have an image; we render each grid against the source
// ref's cover so the structural intent is still visible. A later PR could
// add project-native authoring; for now this is the consumption side.
export function ProjectGrids({
  initial,
}: {
  projectId: string;
  initial: ProjectGrid[];
}) {
  const supabase = createClient();
  const [grids, setGrids] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("이 그리드를 프로젝트에서 제거할까요?")) return;
    setBusy(id);
    const { error } = await supabase
      .from("project_grids")
      .delete()
      .eq("id", id);
    setBusy(null);
    if (error) return;
    setGrids((prev) => prev.filter((g) => g.id !== id));
  }

  if (grids.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        참고 그리드
      </h2>
      <ul className="flex flex-col gap-3">
        {grids.map((g) => (
          <li
            key={g.id}
            className="flex flex-col gap-3 rounded-md border border-input p-3 sm:flex-row"
          >
            <GridPreviewCard grid={g} />
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">
                    {g.label ?? TYPE_LABEL[g.grid_type]}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    {summarize(g)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(g.id)}
                  disabled={busy === g.id}
                  className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                  aria-label="remove"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {g.source_ref_id ? (
                <Link
                  href={`/ref/${g.source_ref_id}`}
                  className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground underline-offset-2 hover:underline"
                >
                  ← 원본 레퍼
                </Link>
              ) : null}
              {g.notes ? (
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {g.notes}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function summarize(g: ProjectGrid): string {
  switch (g.grid_type) {
    case "columnar":
      return `${g.cols}단`;
    case "modular":
      return `${g.cols}×${g.rowscount}`;
    case "manuscript":
      return "manuscript";
    case "custom":
      return `${g.custom_v.length}V · ${g.custom_h.length}H`;
  }
}

// Mini preview — same overlay logic as GridAnalyzer's GridLines but
// read-only and sized to a fixed thumbnail.
function GridPreviewCard({ grid: g }: { grid: ProjectGrid }) {
  const w = g.source_width ?? 4;
  const h = g.source_height ?? 5;
  const url = g.source_image_path ? publicImageUrl(g.source_image_path) : null;
  const aspect = `${w} / ${h}`;

  const left = Number(g.margin_left) * 100;
  const right = Number(g.margin_right) * 100;
  const top = Number(g.margin_top) * 100;
  const bottom = Number(g.margin_bottom) * 100;
  const innerW = 100 - left - right;
  const innerH = 100 - top - bottom;

  let vLines: number[] = [];
  if (g.grid_type === "columnar" || g.grid_type === "modular") {
    const totalGutters = (g.cols - 1) * Number(g.gutter_x) * 100;
    const colW = (innerW - totalGutters) / g.cols;
    for (let i = 1; i < g.cols; i += 1) {
      const x = left + i * colW + (i - 1) * Number(g.gutter_x) * 100;
      vLines.push(x);
      if (Number(g.gutter_x) > 0)
        vLines.push(x + Number(g.gutter_x) * 100);
    }
  }
  if (g.grid_type === "custom") {
    vLines = g.custom_v.map((p) => Number(p) * 100);
  }

  let hLines: number[] = [];
  if (g.grid_type === "modular") {
    const totalGutters = (g.rowscount - 1) * Number(g.gutter_y) * 100;
    const rowH = (innerH - totalGutters) / g.rowscount;
    for (let i = 1; i < g.rowscount; i += 1) {
      const y = top + i * rowH + (i - 1) * Number(g.gutter_y) * 100;
      hLines.push(y);
      if (Number(g.gutter_y) > 0)
        hLines.push(y + Number(g.gutter_y) * 100);
    }
  }
  if (g.grid_type === "custom") {
    hLines = g.custom_h.map((p) => Number(p) * 100);
  }

  return (
    <div
      className="relative w-full max-w-[180px] shrink-0 overflow-hidden rounded-sm bg-muted sm:w-44"
      style={{ aspectRatio: aspect }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      <div className={cn("absolute inset-0", url ? "bg-background/35" : "")} />
      <div
        className="absolute border border-foreground/70"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          right: `${right}%`,
          bottom: `${bottom}%`,
        }}
      />
      {vLines.map((x, i) => (
        <div
          key={`v${i}`}
          className="pointer-events-none absolute bg-foreground/65"
          style={{
            left: `${x}%`,
            top: `${top}%`,
            bottom: `${bottom}%`,
            width: 1,
          }}
        />
      ))}
      {hLines.map((y, i) => (
        <div
          key={`h${i}`}
          className="pointer-events-none absolute bg-foreground/65"
          style={{
            top: `${y}%`,
            left: `${left}%`,
            right: `${right}%`,
            height: 1,
          }}
        />
      ))}
    </div>
  );
}
