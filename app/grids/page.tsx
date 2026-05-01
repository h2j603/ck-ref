import Link from "next/link";

import { fetchGridGallery, type GridGalleryEntry } from "@/lib/queries";
import { publicImageUrl } from "@/lib/storage";
import type { RefGrid } from "@/lib/types";

export const metadata = {
  title: "KIWI Juice — 그리드 갤러리",
};

const TYPE_LABEL: Record<RefGrid["grid_type"], string> = {
  columnar: "단순 칼럼",
  modular: "모듈러",
  manuscript: "매뉴스크립트",
  custom: "수동 라인",
};

export default async function GridGalleryPage() {
  const entries = await fetchGridGallery();
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-8 pt-2">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          KIWI Juice / Grids
        </p>
        <h1 className="text-2xl font-medium tracking-tight">그리드 갤러리</h1>
        <p className="text-sm text-muted-foreground">
          포스터·에디토리얼 레퍼에서 분석한 모든 그리드. 어떤 작업에 어떻게
          퍼져나갔는지도 같이 보여요.
        </p>
      </header>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 그리드가 없어요.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {entries.map((e) => (
            <Entry key={e.grid.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Entry({ entry }: { entry: GridGalleryEntry }) {
  const { grid: g, source_ref, applied_refs, applied_projects } = entry;
  const w = source_ref?.image_width ?? 4;
  const h = source_ref?.image_height ?? 5;
  const url = source_ref ? publicImageUrl(source_ref.image_path) : null;
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

  const summary = (() => {
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
  })();

  return (
    <li className="flex flex-col gap-3 rounded-md border border-input p-3">
      <div className="flex gap-3">
        <Link
          href={source_ref ? `/ref/${source_ref.id}` : "#"}
          className="block w-32 shrink-0"
        >
          <div
            className="relative w-full overflow-hidden rounded-sm bg-muted"
            style={{ aspectRatio: `${w} / ${h}` }}
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
          </div>
        </Link>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">
              {g.label ?? TYPE_LABEL[g.grid_type]}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {summary}
            </span>
          </div>
          {source_ref ? (
            <Link
              href={`/ref/${source_ref.id}`}
              className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ← {source_ref.title ?? "untitled"}
            </Link>
          ) : null}
          {g.notes ? (
            <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
              {g.notes}
            </p>
          ) : null}
        </div>
      </div>
      {applied_refs.length + applied_projects.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            적용된 작업 — {applied_refs.length + applied_projects.length}개
          </p>
          <div className="flex flex-wrap gap-1.5">
            {applied_refs.map((r) => (
              <Link
                key={r.id}
                href={`/ref/${r.id}`}
                className="rounded-full border border-input px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground hover:text-foreground"
              >
                ref · {r.title ?? "untitled"}
              </Link>
            ))}
            {applied_projects.map((p) => (
              <Link
                key={p.id}
                href={`/wip/${p.id}`}
                className="rounded-full border border-input px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted-foreground hover:text-foreground"
              >
                wip · {p.title}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}
