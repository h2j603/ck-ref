"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ApplyGridDialog } from "@/components/detail/ApplyGridDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";
import {
  REF_GRID_TYPES,
  type GridColor,
  type RefGrid,
  type RefGridType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Most poster grids in the wild are 4–12 columns; clamp the steppers
// here so a stray click can't make a 24-column wall.
const MAX_COLS = 18;
const MAX_ROWS = 12;

const TYPE_LABEL: Record<RefGridType, string> = {
  columnar: "단순 칼럼",
  modular: "모듈러",
  manuscript: "매뉴스크립트",
  custom: "수동 라인",
};

const TYPE_HINT: Record<RefGridType, string> = {
  columnar: "균등한 세로 칼럼만. 가장 흔한 포스터 그리드.",
  modular: "칼럼 × 행으로 나뉜 그리드 셀. 잡지·카탈로그형.",
  manuscript: "마진만 있는 단일 텍스트 블록. 책 본문형.",
  custom: "이미지 위에 클릭으로 직접 가로/세로선 추가.",
};

type Draft = {
  id: string | null;
  // Origin grid id when the draft was prefilled from another grid via
  // "다른 곳에 적용". Persisted on save so the gallery can show
  // applied-to lineage.
  source_grid_id: string | null;
  grid_type: RefGridType;
  cols: number;
  rowscount: number;
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  gutter_x: number;
  gutter_y: number;
  baseline: number | null;
  custom_v: number[];
  custom_h: number[];
  label: string;
  notes: string;
  color: GridColor;
};

function emptyDraft(): Draft {
  return {
    id: null,
    source_grid_id: null,
    grid_type: "columnar",
    cols: 6,
    rowscount: 1,
    margin_top: 0.05,
    margin_right: 0.05,
    margin_bottom: 0.05,
    margin_left: 0.05,
    gutter_x: 0.02,
    gutter_y: 0.02,
    baseline: null,
    custom_v: [],
    custom_h: [],
    label: "",
    notes: "",
    color: "dark",
  };
}

function gridToDraft(g: RefGrid): Draft {
  return {
    id: g.id,
    source_grid_id: g.source_grid_id,
    grid_type: g.grid_type,
    cols: g.cols,
    rowscount: g.rowscount,
    margin_top: Number(g.margin_top),
    margin_right: Number(g.margin_right),
    margin_bottom: Number(g.margin_bottom),
    margin_left: Number(g.margin_left),
    gutter_x: Number(g.gutter_x),
    gutter_y: Number(g.gutter_y),
    baseline: g.baseline == null ? null : Number(g.baseline),
    custom_v: g.custom_v.map(Number),
    custom_h: g.custom_h.map(Number),
    label: g.label ?? "",
    notes: g.notes ?? "",
    color: g.color,
  };
}

// Convert a fetched RefGrid into a Draft for prefill purposes — like
// `gridToDraft` but resets `id` (so save creates new) and sets
// `source_grid_id` to the original id.
export function prefillDraftFromGrid(g: RefGrid): Draft {
  const d = gridToDraft(g);
  return { ...d, id: null, source_grid_id: g.id };
}

export type GridSourceImage = {
  // null = the ref's cover; non-null = an extra image's storage path
  path: string | null;
  // canonical storage path used for ref_grids.image_path / project_grids
  // .source_image_path (always non-null)
  storagePath: string;
  url: string;
  width: number;
  height: number;
  label: string;
};

export function GridAnalyzer({
  refId,
  images,
  initial,
}: {
  refId: string;
  // Cover (if non-video) plus any extra images that aren't videos.
  // Empty array means there's nothing to analyze (rare — caller should
  // not render this component in that case).
  images: GridSourceImage[];
  initial: RefGrid[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { nickname } = useNickname();
  const [grids, setGrids] = useState<RefGrid[]>(initial);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(true);
  // Which image the user is currently analyzing. Defaults to the first
  // (cover or first extra if cover is video). Saving / showing grids is
  // scoped to this selection.
  const [activeIdx, setActiveIdx] = useState(0);
  const active = images[activeIdx] ?? images[0];

  // Honor ?from_grid=<id> — fetch the source grid spec and open the
  // editor pre-filled with it. Lets "다른 곳에 적용" land users in the
  // analyzer with the grid ready to adjust against the new image.
  const prefillId = searchParams.get("from_grid");
  useEffect(() => {
    if (!prefillId || editing) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("ref_grids")
        .select("*")
        .eq("id", prefillId)
        .maybeSingle();
      if (cancelled || !data) return;
      setEditing(prefillDraftFromGrid(data as RefGrid));
      // Strip the param so refreshes don't re-trigger.
      router.replace(window.location.pathname);
    })();
    return () => {
      cancelled = true;
    };
    // editing intentionally excluded — we only want to act on first mount with the param
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillId]);

  // Match a saved grid to the currently selected image. Cover grids
  // were stored with image_path = NULL historically — surface those
  // alongside grids stamped explicitly with the cover's path.
  const visibleGrids = grids.filter((g) => {
    if (!active) return false;
    if (active.path === null) {
      // Selected image is the cover. Show NULL or matching cover path.
      return g.image_path == null || g.image_path === active.storagePath;
    }
    return g.image_path === active.storagePath;
  });

  async function save() {
    if (!editing || !active) return;
    setBusy(true);
    setError(null);
    const payload = {
      ref_id: refId,
      image_path: active.storagePath,
      grid_type: editing.grid_type,
      cols: editing.cols,
      rowscount: editing.rowscount,
      margin_top: editing.margin_top,
      margin_right: editing.margin_right,
      margin_bottom: editing.margin_bottom,
      margin_left: editing.margin_left,
      gutter_x: editing.gutter_x,
      gutter_y: editing.gutter_y,
      baseline: editing.baseline,
      custom_v: editing.custom_v,
      custom_h: editing.custom_h,
      label: editing.label.trim() || null,
      notes: editing.notes.trim() || null,
      color: editing.color,
      source_grid_id: editing.source_grid_id,
      created_by: nickname,
    };
    if (editing.id) {
      const { data, error: err } = await supabase
        .from("ref_grids")
        .update(payload)
        .eq("id", editing.id)
        .select("*")
        .single();
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      setGrids((prev) =>
        prev.map((g) => (g.id === editing.id ? (data as RefGrid) : g)),
      );
    } else {
      const { data, error: err } = await supabase
        .from("ref_grids")
        .insert(payload)
        .select("*")
        .single();
      setBusy(false);
      if (err) {
        setError(err.message);
        return;
      }
      setGrids((prev) => [...prev, data as RefGrid]);
    }
    setEditing(null);
  }

  async function remove(id: string) {
    if (!confirm("이 그리드를 삭제할까요?")) return;
    setBusy(true);
    const { error: err } = await supabase
      .from("ref_grids")
      .delete()
      .eq("id", id);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setGrids((prev) => prev.filter((g) => g.id !== id));
    if (editing?.id === id) setEditing(null);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          그리드 분석
        </h2>
        {!editing ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(emptyDraft())}
          >
            <Plus className="size-3" /> 새 그리드
          </Button>
        ) : null}
      </div>

      {images.length > 1 && !editing ? (
        <div className="flex flex-wrap gap-1.5">
          {images.map((img, i) => (
            <button
              key={img.storagePath}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
                i === activeIdx
                  ? "border-foreground bg-foreground text-background"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {img.label}
            </button>
          ))}
        </div>
      ) : null}

      {!editing ? (
        !active ? (
          <p className="text-sm text-muted-foreground">
            분석 가능한 이미지가 없어요. (커버와 추가 이미지가 모두 비디오)
          </p>
        ) : visibleGrids.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            이 이미지에는 아직 등록된 그리드가 없어요. 새 그리드를 추가하면
            칼럼·행·여백·거터를 직접 맞춰볼 수 있어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleGrids.map((g) => (
              <li
                key={g.id}
                className="flex items-start justify-between gap-3 rounded-md border border-input p-3"
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => setEditing(gridToDraft(g))}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">
                      {g.label ?? TYPE_LABEL[g.grid_type]}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      {summarizeGrid(g)}
                    </span>
                  </div>
                  {g.notes ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      {g.notes}
                    </p>
                  ) : null}
                </button>
                <div className="flex flex-col items-end gap-1.5">
                  <ApplyGridDialog
                    grid={g}
                    sourceRefId={refId}
                    sourceImagePath={active.storagePath}
                    sourceWidth={active.width}
                    sourceHeight={active.height}
                  />
                  <button
                    type="button"
                    onClick={() => void remove(g.id)}
                    className="rounded-md p-1 text-muted-foreground hover:text-destructive"
                    aria-label="delete"
                    disabled={busy}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : active ? (
        <GridEditor
          draft={editing}
          onChange={setEditing}
          imageUrl={active.url}
          width={active.width}
          height={active.height}
          showImage={showImage}
          onShowImageChange={setShowImage}
        />
      ) : null}

      {editing ? (
        <div className="flex items-center justify-end gap-2">
          {error ? (
            <p className="mr-auto text-xs text-destructive">{error}</p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(null)}
            disabled={busy}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? "저장 중…" : editing.id ? "수정 저장" : "그리드 저장"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function summarizeGrid(g: RefGrid): string {
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

// Editing UI: live preview overlay above the controls. Margins/gutters
// live in fractional space so the preview just multiplies by the
// rendered box size.
function GridEditor({
  draft,
  onChange,
  imageUrl,
  width,
  height,
  showImage,
  onShowImageChange,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  imageUrl: string;
  width: number;
  height: number;
  showImage: boolean;
  onShowImageChange: (b: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <GridPreview
        draft={draft}
        onChange={onChange}
        imageUrl={imageUrl}
        width={width}
        height={height}
        showImage={showImage}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {REF_GRID_TYPES.map((t) => {
          const active = draft.grid_type === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ ...draft, grid_type: t })}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              {TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {TYPE_HINT[draft.grid_type]}
      </p>

      {draft.grid_type === "columnar" || draft.grid_type === "modular" ? (
        <div className="grid grid-cols-2 gap-3">
          <Stepper
            label="칼럼"
            value={draft.cols}
            min={1}
            max={MAX_COLS}
            onChange={(v) => onChange({ ...draft, cols: v })}
          />
          {draft.grid_type === "modular" ? (
            <Stepper
              label="행"
              value={draft.rowscount}
              min={1}
              max={MAX_ROWS}
              onChange={(v) => onChange({ ...draft, rowscount: v })}
            />
          ) : null}
        </div>
      ) : null}

      {draft.grid_type !== "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <SliderField
            label="좌·우 마진"
            value={draft.margin_left}
            onChange={(v) =>
              onChange({ ...draft, margin_left: v, margin_right: v })
            }
          />
          <SliderField
            label="상·하 마진"
            value={draft.margin_top}
            onChange={(v) =>
              onChange({ ...draft, margin_top: v, margin_bottom: v })
            }
          />
          {draft.grid_type !== "manuscript" ? (
            <>
              <SliderField
                label="가로 거터"
                value={draft.gutter_x}
                onChange={(v) => onChange({ ...draft, gutter_x: v })}
                max={0.1}
              />
              <SliderField
                label="세로 거터"
                value={draft.gutter_y}
                onChange={(v) => onChange({ ...draft, gutter_y: v })}
                max={0.1}
                disabled={draft.grid_type !== "modular"}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              baseline: draft.baseline == null ? 0.025 : null,
            })
          }
          className={cn(
            "rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
            draft.baseline != null
              ? "border-foreground bg-foreground text-background"
              : "border-input text-muted-foreground hover:text-foreground",
          )}
        >
          베이스라인
        </button>
        {draft.baseline != null ? (
          <SliderField
            label="간격"
            value={draft.baseline}
            min={0.005}
            max={0.08}
            onChange={(v) => onChange({ ...draft, baseline: v })}
            compact
          />
        ) : null}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              color: draft.color === "light" ? "dark" : "light",
            })
          }
          className={cn(
            "rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors",
            draft.color === "light"
              ? "border-input bg-foreground text-background"
              : "border-input text-muted-foreground hover:text-foreground",
          )}
          title="그리드 라인 색상"
        >
          {draft.color === "light" ? "흰색 라인" : "검은색 라인"}
        </button>
        <label className="ml-auto flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          <input
            type="checkbox"
            checked={showImage}
            onChange={(e) => onShowImageChange(e.target.checked)}
            className="size-3"
          />
          이미지 표시
        </label>
      </div>

      {draft.grid_type === "custom" ? (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          이미지를 길게 누르거나 클릭하면 가로/세로선이 추가돼요. 선을
          한번 더 누르면 제거됩니다. (좌/우 마진 영역 클릭 시 가로선,
          상/하 마진 영역 클릭 시 세로선이 들어감)
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            라벨 (선택)
          </span>
          <Input
            value={draft.label}
            onChange={(e) => onChange({ ...draft, label: e.target.value })}
            placeholder="예: 타입 그리드, 이미지 그리드"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            메모 (선택)
          </span>
          <textarea
            value={draft.notes}
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
            rows={2}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="이 그리드로 보면 보이는 점"
          />
        </label>
      </div>

      <RatioReadout draft={draft} width={width} height={height} />
    </div>
  );
}

// Renders the image with the live grid overlay. For "custom" type, taps
// inside the content area add lines; taps on existing lines remove them.
function GridPreview({
  draft,
  onChange,
  imageUrl,
  width,
  height,
  showImage,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  imageUrl: string;
  width: number;
  height: number;
  showImage: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const aspect = `${width} / ${height}`;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (draft.grid_type !== "custom") return;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    // Decide vertical vs horizontal by which border the click is closer
    // to. Edge clicks (within margin band) add lines aligned with that
    // axis; center clicks add whichever axis is currently sparser.
    const inLeftRight = x < draft.margin_left || x > 1 - draft.margin_right;
    const inTopBottom = y < draft.margin_top || y > 1 - draft.margin_bottom;
    const wantsHorizontal = inLeftRight && !inTopBottom;
    const wantsVertical = inTopBottom && !inLeftRight;
    const decision = wantsHorizontal
      ? "h"
      : wantsVertical
        ? "v"
        : draft.custom_v.length <= draft.custom_h.length
          ? "v"
          : "h";

    if (decision === "v") {
      // Toggle: if any existing v-line is within 1.5% of the click, remove
      // it; otherwise add a new one.
      const idx = draft.custom_v.findIndex((p) => Math.abs(p - x) < 0.015);
      const next =
        idx >= 0
          ? draft.custom_v.filter((_, i) => i !== idx)
          : [...draft.custom_v, x].sort((a, b) => a - b);
      onChange({ ...draft, custom_v: next });
    } else {
      const idx = draft.custom_h.findIndex((p) => Math.abs(p - y) < 0.015);
      const next =
        idx >= 0
          ? draft.custom_h.filter((_, i) => i !== idx)
          : [...draft.custom_h, y].sort((a, b) => a - b);
      onChange({ ...draft, custom_h: next });
    }
  }

  return (
    <div
      ref={wrapRef}
      onClick={handleClick}
      className="relative w-full overflow-hidden rounded-md bg-muted"
      style={{ aspectRatio: aspect }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-foreground/[0.03]" />
      )}
      <div
        className={cn(
          "absolute inset-0",
          showImage ? "bg-background/30" : "",
        )}
      />
      <GridLines draft={draft} />
    </div>
  );
}

function GridLines({ draft }: { draft: Draft }) {
  // Content rect edges as percentages
  const left = draft.margin_left * 100;
  const right = draft.margin_right * 100;
  const top = draft.margin_top * 100;
  const bottom = draft.margin_bottom * 100;
  const innerW = 100 - left - right;
  const innerH = 100 - top - bottom;

  // Stroke color resolves at render time so the same GridLines is reused
  // across light / dark grids on the same image.
  const stroke =
    draft.color === "light" ? "rgb(255 255 255)" : "rgb(0 0 0)";
  const lineColor =
    draft.color === "light" ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.65)";
  const baselineColor =
    draft.color === "light" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.2)";

  // Margin frame stroke (always shown)
  const frame = (
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
  );

  // Vertical column gridlines
  let vLines: number[] = [];
  if (draft.grid_type === "columnar" || draft.grid_type === "modular") {
    const cols = draft.cols;
    if (cols >= 1) {
      const totalGutters = (cols - 1) * draft.gutter_x * 100;
      const colW = (innerW - totalGutters) / cols;
      for (let i = 1; i < cols; i += 1) {
        const x = left + i * colW + (i - 1) * draft.gutter_x * 100;
        vLines.push(x);
        if (draft.gutter_x > 0)
          vLines.push(x + draft.gutter_x * 100);
      }
    }
  }
  if (draft.grid_type === "custom") {
    vLines = draft.custom_v.map((p) => p * 100);
  }

  // Horizontal row gridlines
  let hLines: number[] = [];
  if (draft.grid_type === "modular") {
    const rows = draft.rowscount;
    if (rows >= 1) {
      const totalGutters = (rows - 1) * draft.gutter_y * 100;
      const rowH = (innerH - totalGutters) / rows;
      for (let i = 1; i < rows; i += 1) {
        const y = top + i * rowH + (i - 1) * draft.gutter_y * 100;
        hLines.push(y);
        if (draft.gutter_y > 0)
          hLines.push(y + draft.gutter_y * 100);
      }
    }
  }
  if (draft.grid_type === "custom") {
    hLines = draft.custom_h.map((p) => p * 100);
  }

  // Baseline
  const baselines: number[] = [];
  if (draft.baseline != null && draft.baseline > 0) {
    let y = top;
    while (y < 100 - bottom) {
      baselines.push(y);
      y += draft.baseline * 100;
    }
  }

  return (
    <>
      {frame}
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
      {baselines.map((y, i) => (
        <div
          key={`bl${i}`}
          className="pointer-events-none absolute"
          style={{
            top: `${y}%`,
            left: `${left}%`,
            right: `${right}%`,
            height: 1,
            background: baselineColor,
          }}
        />
      ))}
    </>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-input px-3 py-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-input px-2 py-0.5 font-mono text-xs"
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span className="w-6 text-center font-mono text-sm tabular-nums">
          {value}
        </span>
        <button
          type="button"
          className="rounded-md border border-input px-2 py-0.5 font-mono text-xs"
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min = 0,
  max = 0.2,
  onChange,
  disabled,
  compact,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex flex-col gap-1",
        compact ? "flex-1" : "",
        disabled ? "opacity-50" : "",
      )}
    >
      <span className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{(value * 100).toFixed(1)}%</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.005}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full accent-foreground"
      />
    </label>
  );
}

// Computes the proportion of each column / row and surfaces them so the
// designer can see e.g. "12 columns @ 6.6% each, gutter 1.7%" or pick
// up unintended asymmetry. Also flags golden-ratio-adjacent splits
// since those tend to be intentional choices worth labelling.
function RatioReadout({
  draft,
  width,
  height,
}: {
  draft: Draft;
  width: number;
  height: number;
}) {
  const innerW = 1 - draft.margin_left - draft.margin_right;
  const innerH = 1 - draft.margin_top - draft.margin_bottom;
  const lines: string[] = [];

  if (draft.grid_type === "columnar" || draft.grid_type === "modular") {
    const totalGuttersX = (draft.cols - 1) * draft.gutter_x;
    const colW = (innerW - totalGuttersX) / draft.cols;
    lines.push(
      `칼럼 ${draft.cols}개 — 각 ${(colW * 100).toFixed(1)}%, 거터 ${(draft.gutter_x * 100).toFixed(1)}%`,
    );
  }
  if (draft.grid_type === "modular") {
    const totalGuttersY = (draft.rowscount - 1) * draft.gutter_y;
    const rowH = (innerH - totalGuttersY) / draft.rowscount;
    lines.push(
      `행 ${draft.rowscount}개 — 각 ${(rowH * 100).toFixed(1)}%, 거터 ${(draft.gutter_y * 100).toFixed(1)}%`,
    );
  }

  // Image aspect + content area aspect
  const imgAspect = width / height;
  const contentAspect = (innerW * width) / (innerH * height);
  lines.push(
    `이미지 비율 ${imgAspect.toFixed(3)} (${width}×${height}) · 컨텐츠 영역 비율 ${contentAspect.toFixed(3)}`,
  );

  // Golden ratio annotation
  const phi = 1.618;
  for (const r of [imgAspect, contentAspect]) {
    if (Math.abs(r - phi) < 0.05 || Math.abs(1 / r - phi) < 0.05) {
      lines.push("✦ 황금비 (1:1.618)에 근접한 비율");
      break;
    }
  }
  if (Math.abs(imgAspect - 1) < 0.02) {
    lines.push("✦ 정사각 비율");
  }
  // Common ISO paper aspects
  const sqrt2 = Math.SQRT2;
  if (Math.abs(imgAspect - 1 / sqrt2) < 0.02) {
    lines.push("✦ ISO 종이 비율 (A/B 시리즈, 1:√2)");
  }

  if (draft.baseline != null) {
    const bl = draft.baseline * height;
    lines.push(
      `베이스라인 ${(draft.baseline * 100).toFixed(1)}% (≈ ${bl.toFixed(0)}px @ 원본)`,
    );
  }

  return (
    <div className="rounded-md border border-input bg-muted/50 p-3 text-xs leading-relaxed text-foreground">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        측정값
      </p>
      {lines.map((l, i) => (
        <p key={i} className="font-mono tabular-nums">
          {l}
        </p>
      ))}
    </div>
  );
}
