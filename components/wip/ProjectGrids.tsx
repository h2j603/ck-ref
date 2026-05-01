"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { ProjectGrid, RefGrid } from "@/lib/types";
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
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProjectGrid[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { nickname } = useNickname();
  const [grids, setGrids] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  // ?from_grid=<id> arrives from "다른 곳에 적용" on a ref. We fetch
  // the source spec and show a confirmation banner above the list so
  // the user sees a preview against the source ref's image before
  // committing to add it.
  const prefillId = searchParams.get("from_grid");
  const [pending, setPending] = useState<RefGrid | null>(null);
  useEffect(() => {
    if (!prefillId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("ref_grids")
        .select("*")
        .eq("id", prefillId)
        .maybeSingle();
      if (!cancelled && data) setPending(data as RefGrid);
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillId, supabase]);
  function clearPrefill() {
    setPending(null);
    router.replace(window.location.pathname);
  }

  async function confirmPrefill() {
    if (!pending) return;
    setBusy("__prefill__");
    // Pull source ref's image meta so the preview keeps working.
    const { data: srcRef } = await supabase
      .from("refs")
      .select("id, image_path, image_width, image_height")
      .eq("id", pending.ref_id)
      .maybeSingle();
    type SrcRef = {
      id: string;
      image_path: string;
      image_width: number | null;
      image_height: number | null;
    };
    const sr = srcRef as SrcRef | null;
    const { data, error } = await supabase
      .from("project_grids")
      .insert({
        project_id: projectId,
        source_ref_id: pending.ref_id,
        source_image_path:
          pending.image_path ?? sr?.image_path ?? null,
        source_width: sr?.image_width ?? null,
        source_height: sr?.image_height ?? null,
        source_grid_id: pending.id,
        grid_type: pending.grid_type,
        cols: pending.cols,
        rowscount: pending.rowscount,
        margin_top: pending.margin_top,
        margin_right: pending.margin_right,
        margin_bottom: pending.margin_bottom,
        margin_left: pending.margin_left,
        gutter_x: pending.gutter_x,
        gutter_y: pending.gutter_y,
        baseline: pending.baseline,
        custom_v: pending.custom_v,
        custom_h: pending.custom_h,
        label: pending.label,
        notes: pending.notes,
        color: pending.color,
        created_by: nickname,
      })
      .select("*")
      .single();
    setBusy(null);
    if (error) return;
    setGrids((prev) => [...prev, data as ProjectGrid]);
    clearPrefill();
  }

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

  if (grids.length === 0 && !pending) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        참고 그리드
      </h2>
      {pending ? (
        <div className="flex flex-col gap-3 rounded-md border border-foreground/40 bg-muted/40 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">
                {pending.label ?? TYPE_LABEL[pending.grid_type]}
              </span>{" "}
              그리드를 이 프로젝트에 추가할까요?
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearPrefill}
                disabled={busy === "__prefill__"}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void confirmPrefill()}
                disabled={busy === "__prefill__"}
              >
                {busy === "__prefill__" ? "추가 중…" : "추가"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
  const stroke = g.color === "light" ? "rgb(255 255 255)" : "rgb(0 0 0)";
  const lineColor =
    g.color === "light" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.65)";

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
        className="absolute"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          right: `${right}%`,
          bottom: `${bottom}%`,
          border: `1px solid ${stroke}`,
          opacity: 0.75,
        }}
      />
      {vLines.map((x, i) => (
        <div
          key={`v${i}`}
          className="pointer-events-none absolute"
          style={{
            left: `${x}%`,
            top: `${top}%`,
            bottom: `${bottom}%`,
            width: 1,
            background: lineColor,
          }}
        />
      ))}
      {hLines.map((y, i) => (
        <div
          key={`h${i}`}
          className="pointer-events-none absolute"
          style={{
            top: `${y}%`,
            left: `${left}%`,
            right: `${right}%`,
            height: 1,
            background: lineColor,
          }}
        />
      ))}
    </div>
  );
}
