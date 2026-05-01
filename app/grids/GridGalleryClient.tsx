"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { publicImageUrl } from "@/lib/storage";
import type { GridGalleryEntry } from "@/lib/queries";
import { type RefGrid, type RefGridType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<RefGridType, string> = {
  columnar: "단순 칼럼",
  modular: "모듈러",
  manuscript: "매뉴스크립트",
  custom: "수동 라인",
};

type TypeFilter = RefGridType | "all";
type ColsBucket = "all" | "1-2" | "3" | "4" | "5-6" | "7+";
type SortKey = "recent" | "applied";

function bucketFor(cols: number): Exclude<ColsBucket, "all"> {
  if (cols <= 2) return "1-2";
  if (cols === 3) return "3";
  if (cols === 4) return "4";
  if (cols <= 6) return "5-6";
  return "7+";
}

const COLS_BUCKETS: Exclude<ColsBucket, "all">[] = [
  "1-2",
  "3",
  "4",
  "5-6",
  "7+",
];

// Are.na-style masonry with bigger thumbnails. Uses native CSS columns
// for the layout — no JS positioning, smooth column-flow as the
// viewport changes. Filter / sort runs client-side over the entire
// fetched list.
export function GridGalleryClient({
  entries,
}: {
  entries: GridGalleryEntry[];
}) {
  const [type, setType] = useState<TypeFilter>("all");
  const [cols, setCols] = useState<ColsBucket>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  // Bucket counts let chips show "(N)" so the user knows what's
  // populated before clicking.
  const typeCounts = useMemo(() => {
    const m = new Map<TypeFilter, number>();
    m.set("all", entries.length);
    for (const e of entries) {
      m.set(e.grid.grid_type, (m.get(e.grid.grid_type) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  const colsCounts = useMemo(() => {
    const m = new Map<ColsBucket, number>();
    m.set("all", entries.length);
    for (const e of entries) {
      const b = bucketFor(e.grid.cols);
      m.set(b, (m.get(b) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    const base = entries.filter((e) => {
      if (type !== "all" && e.grid.grid_type !== type) return false;
      if (cols !== "all" && bucketFor(e.grid.cols) !== cols) return false;
      return true;
    });
    if (sort === "applied") {
      return [...base].sort(
        (a, b) =>
          b.applied_to_refs +
          b.applied_to_projects -
          (a.applied_to_refs + a.applied_to_projects),
      );
    }
    // 'recent' — entries already arrive desc by created_at from the
    // server query.
    return base;
  }, [entries, type, cols, sort]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4">
        <Row label="Type">
          <Chip
            active={type === "all"}
            onClick={() => setType("all")}
            label={`all (${typeCounts.get("all") ?? 0})`}
          />
          {(Object.keys(TYPE_LABEL) as RefGridType[]).map((t) => (
            <Chip
              key={t}
              active={type === t}
              onClick={() => setType(t)}
              label={`${TYPE_LABEL[t]} (${typeCounts.get(t) ?? 0})`}
            />
          ))}
        </Row>
        <Row label="Cols">
          <Chip
            active={cols === "all"}
            onClick={() => setCols("all")}
            label="all"
          />
          {COLS_BUCKETS.map((b) => (
            <Chip
              key={b}
              active={cols === b}
              onClick={() => setCols(b)}
              label={`${b} (${colsCounts.get(b) ?? 0})`}
            />
          ))}
        </Row>
        <Row label="Sort">
          <Chip
            active={sort === "recent"}
            onClick={() => setSort("recent")}
            label="최근"
          />
          <Chip
            active={sort === "applied"}
            onClick={() => setSort("applied")}
            label="많이 적용"
          />
        </Row>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">조건에 맞는 그리드가 없어요.</p>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
          {filtered.map((e) => (
            <GridCard key={e.grid.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function GridCard({ entry }: { entry: GridGalleryEntry }) {
  const { grid: g, source_ref, applied_refs, applied_projects } = entry;
  const w = source_ref?.image_width ?? 4;
  const h = source_ref?.image_height ?? 5;
  const url = source_ref ? publicImageUrl(source_ref.image_path) : null;
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
      if (Number(g.gutter_x) > 0) vLines.push(x + Number(g.gutter_x) * 100);
    }
  }
  if (g.grid_type === "custom") vLines = g.custom_v.map((p) => Number(p) * 100);
  let hLines: number[] = [];
  if (g.grid_type === "modular") {
    const totalGutters = (g.rowscount - 1) * Number(g.gutter_y) * 100;
    const rowH = (innerH - totalGutters) / g.rowscount;
    for (let i = 1; i < g.rowscount; i += 1) {
      const y = top + i * rowH + (i - 1) * Number(g.gutter_y) * 100;
      hLines.push(y);
      if (Number(g.gutter_y) > 0) hLines.push(y + Number(g.gutter_y) * 100);
    }
  }
  if (g.grid_type === "custom") hLines = g.custom_h.map((p) => Number(p) * 100);

  const summary = summaryFor(g);
  const appliedTotal = applied_refs.length + applied_projects.length;

  return (
    <div className="group flex flex-col gap-2">
      <Link
        href={source_ref ? `/ref/${source_ref.id}` : "#"}
        className="relative block w-full overflow-hidden rounded-md bg-muted"
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
        <div className="absolute inset-0 bg-background/30" />
        <div
          className="absolute"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            right: `${right}%`,
            bottom: `${bottom}%`,
            border: `1px solid ${stroke}`,
            opacity: 0.8,
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
        {/* hover overlay — label / type / applied count */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/70 via-black/0 to-black/0 p-3 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <p className="text-[12px] font-medium leading-tight">
            {g.label ?? TYPE_LABEL[g.grid_type]}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wide opacity-80">
            {summary}
            {appliedTotal > 0 ? ` · 적용 ${appliedTotal}` : ""}
          </p>
        </div>
      </Link>
      <div className="flex flex-col gap-1 px-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs">
            {g.label ?? TYPE_LABEL[g.grid_type]}
          </span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {summary}
          </span>
        </div>
        {source_ref ? (
          <Link
            href={`/ref/${source_ref.id}`}
            className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            ← {source_ref.title ?? "untitled"}
          </Link>
        ) : null}
        {appliedTotal > 0 ? (
          <div className="flex flex-wrap gap-1">
            {applied_refs.map((r) => (
              <Link
                key={r.id}
                href={`/ref/${r.id}`}
                className="rounded-full border border-input px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-muted-foreground hover:text-foreground"
              >
                ref · {truncate(r.title ?? "untitled", 16)}
              </Link>
            ))}
            {applied_projects.map((p) => (
              <Link
                key={p.id}
                href={`/wip/${p.id}`}
                className="rounded-full border border-input px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-muted-foreground hover:text-foreground"
              >
                wip · {truncate(p.title, 16)}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function summaryFor(g: RefGrid): string {
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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
