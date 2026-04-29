"use client";

import { Star, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useNickname } from "@/lib/nickname";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type RefLite = {
  id: string;
  title: string | null;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  color_hex: string | null;
};

export type PositioningPoint = {
  id: string;
  ref_id: string | null;
  label: string | null;
  x: number;
  y: number;
  is_self: boolean;
  color: string | null;
  ref: RefLite | null;
};

export type PositioningAxes = {
  x_low_label: string | null;
  x_high_label: string | null;
  y_low_label: string | null;
  y_high_label: string | null;
};

// Starter axis pairs so the map isn't a blank slate. Picked to cover the
// dimensions we usually argue about for our own work — price, tone, audience,
// era, texture, intent. The preset row only shows when nothing has been set.
const AXIS_PRESETS: { name: string; axes: PositioningAxes }[] = [
  {
    name: "가격 × 혁신",
    axes: {
      x_low_label: "저렴",
      x_high_label: "프리미엄",
      y_low_label: "전통적",
      y_high_label: "혁신적",
    },
  },
  {
    name: "톤 × 밀도",
    axes: {
      x_low_label: "진지함",
      x_high_label: "유희적",
      y_low_label: "미니멀",
      y_high_label: "장식적",
    },
  },
  {
    name: "관객 × 목소리",
    axes: {
      x_low_label: "대중적",
      x_high_label: "전문적",
      y_low_label: "친근함",
      y_high_label: "권위적",
    },
  },
  {
    name: "시대 × 에너지",
    axes: {
      x_low_label: "클래식",
      x_high_label: "트렌디",
      y_low_label: "차분함",
      y_high_label: "화려함",
    },
  },
  {
    name: "질감 × 온도",
    axes: {
      x_low_label: "디지털",
      x_high_label: "아날로그",
      y_low_label: "차가움",
      y_high_label: "따뜻함",
    },
  },
  {
    name: "기능 × 감정",
    axes: {
      x_low_label: "기능적",
      x_high_label: "감성적",
      y_low_label: "정적",
      y_high_label: "동적",
    },
  },
];

export function PositioningMap({
  projectId,
  createdBy,
  initialAxes,
  initialPoints,
  inspirationRefs,
}: {
  projectId: string;
  createdBy: string | null;
  initialAxes: PositioningAxes | null;
  initialPoints: PositioningPoint[];
  inspirationRefs: RefLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const canEdit = hydrated && nickname !== null && nickname === createdBy;

  const [axes, setAxes] = useState<PositioningAxes>({
    x_low_label: initialAxes?.x_low_label ?? null,
    x_high_label: initialAxes?.x_high_label ?? null,
    y_low_label: initialAxes?.y_low_label ?? null,
    y_high_label: initialAxes?.y_high_label ?? null,
  });
  const [points, setPoints] = useState<PositioningPoint[]>(initialPoints);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<PositioningPoint | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Read-only viewers shouldn't see an empty grid; hide the whole map until
  // the owner has plotted something or labelled an axis.
  const hasContent =
    points.length > 0 ||
    Boolean(axes.x_low_label) ||
    Boolean(axes.x_high_label) ||
    Boolean(axes.y_low_label) ||
    Boolean(axes.y_high_label);

  // Drag state. We track the dragged point id and the latest coords; on
  // pointer-up we persist. Using a ref so the move handler reads the latest
  // value without re-binding on each render.
  const dragRef = useRef<{ id: string; lastX: number; lastY: number } | null>(
    null,
  );

  function clientToCoords(clientX: number, clientY: number) {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    // Y axis: top of screen = y = 1 in our model.
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
    return {
      x: Math.max(-1, Math.min(1, nx)),
      y: Math.max(-1, Math.min(1, ny)),
    };
  }

  async function persistAxes(next: PositioningAxes) {
    setError(null);
    const previous = axes;
    setAxes(next);
    const { error } = await supabase.from("project_positioning").upsert(
      {
        project_id: projectId,
        ...next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );
    if (error) {
      setError(error.message);
      setAxes(previous);
    }
  }

  async function addPoint(input: {
    x: number;
    y: number;
    label: string | null;
    ref: RefLite | null;
    is_self: boolean;
  }) {
    setError(null);
    const { data, error } = await supabase
      .from("project_positioning_points")
      .insert({
        project_id: projectId,
        x: input.x,
        y: input.y,
        label: input.label,
        ref_id: input.ref?.id ?? null,
        is_self: input.is_self,
        color: input.ref?.color_hex ?? null,
        created_by: nickname || null,
      })
      .select("*")
      .single();
    if (error || !data) {
      setError(error?.message ?? "추가 실패");
      return;
    }
    type Row = {
      id: string;
      ref_id: string | null;
      label: string | null;
      x: number;
      y: number;
      is_self: boolean;
      color: string | null;
    };
    const row = data as Row;
    setPoints((prev) => [
      ...prev,
      {
        id: row.id,
        ref_id: row.ref_id,
        label: row.label,
        x: row.x,
        y: row.y,
        is_self: row.is_self,
        color: row.color,
        ref: input.ref,
      },
    ]);
  }

  async function updatePoint(id: string, patch: Partial<PositioningPoint>) {
    setError(null);
    const previous = points;
    setPoints((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
    const dbPatch: Record<string, unknown> = {};
    if ("x" in patch) dbPatch.x = patch.x;
    if ("y" in patch) dbPatch.y = patch.y;
    if ("label" in patch) dbPatch.label = patch.label;
    if ("is_self" in patch) dbPatch.is_self = patch.is_self;
    const { error } = await supabase
      .from("project_positioning_points")
      .update(dbPatch)
      .eq("id", id);
    if (error) {
      setError(error.message);
      setPoints(previous);
    }
  }

  async function deletePoint(id: string) {
    setError(null);
    const previous = points;
    setPoints((prev) => prev.filter((p) => p.id !== id));
    const { error } = await supabase
      .from("project_positioning_points")
      .delete()
      .eq("id", id);
    if (error) {
      setError(error.message);
      setPoints(previous);
    }
  }

  function handlePointerDownOnPoint(
    e: React.PointerEvent,
    point: PositioningPoint,
  ) {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: point.id, lastX: point.x, lastY: point.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const { x, y } = clientToCoords(e.clientX, e.clientY);
    dragRef.current.lastX = x;
    dragRef.current.lastY = y;
    setPoints((prev) =>
      prev.map((p) => (p.id === dragRef.current!.id ? { ...p, x, y } : p)),
    );
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    void updatePoint(drag.id, { x: drag.lastX, y: drag.lastY });
  }

  function handleMapClick(e: React.MouseEvent) {
    if (!canEdit) return;
    if ((e.target as HTMLElement).closest("[data-point]")) return;
    const { x, y } = clientToCoords(e.clientX, e.clientY);
    setAdding({ x, y });
  }

  if (!canEdit && !hasContent) return null;

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          포지셔닝 맵 — {points.length}
        </h2>
        {canEdit ? (
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            빈 곳 클릭으로 추가 · 드래그로 이동
          </p>
        ) : null}
      </header>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {canEdit &&
      !axes.x_low_label &&
      !axes.x_high_label &&
      !axes.y_low_label &&
      !axes.y_high_label ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            추천 축
          </span>
          {AXIS_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => void persistAxes(preset.axes)}
              className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              title={`${preset.axes.x_low_label} ↔ ${preset.axes.x_high_label} / ${preset.axes.y_low_label} ↔ ${preset.axes.y_high_label}`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <AxisLabel
          value={axes.y_high_label}
          canEdit={canEdit}
          onSave={(v) => persistAxes({ ...axes, y_high_label: v })}
          align="center"
          placeholder="(상단 축 라벨)"
        />
        <div className="flex items-center gap-2">
          <AxisLabel
            value={axes.x_low_label}
            canEdit={canEdit}
            onSave={(v) => persistAxes({ ...axes, x_low_label: v })}
            align="vertical"
            placeholder="(좌측 X)"
          />
          <div
            ref={containerRef}
            onClick={handleMapClick}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={cn(
              "relative aspect-square w-full select-none overflow-hidden rounded-md border border-border bg-muted/20",
              canEdit ? "cursor-crosshair" : "cursor-default",
            )}
          >
            <div className="absolute inset-x-0 top-1/2 h-px bg-border/60" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-border/60" />
            {points.map((p) => (
              <PointMarker
                key={p.id}
                point={p}
                canEdit={canEdit}
                onPointerDown={(e) => handlePointerDownOnPoint(e, p)}
                onClickEdit={() => setEditing(p)}
              />
            ))}
          </div>
          <AxisLabel
            value={axes.x_high_label}
            canEdit={canEdit}
            onSave={(v) => persistAxes({ ...axes, x_high_label: v })}
            align="vertical"
            placeholder="(우측 X)"
          />
        </div>
        <AxisLabel
          value={axes.y_low_label}
          canEdit={canEdit}
          onSave={(v) => persistAxes({ ...axes, y_low_label: v })}
          align="center"
          placeholder="(하단 축 라벨)"
        />
      </div>

      {adding ? (
        <AddPointDialog
          open
          coords={adding}
          inspirationRefs={inspirationRefs}
          onClose={() => setAdding(null)}
          onConfirm={async (payload) => {
            await addPoint(payload);
            setAdding(null);
          }}
        />
      ) : null}
      {editing ? (
        <EditPointDialog
          open
          point={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await updatePoint(editing.id, patch);
            setEditing(null);
          }}
          onDelete={async () => {
            await deletePoint(editing.id);
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function PointMarker({
  point,
  canEdit,
  onPointerDown,
  onClickEdit,
}: {
  point: PositioningPoint;
  canEdit: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClickEdit: () => void;
}) {
  const left = ((point.x + 1) / 2) * 100;
  const top = ((1 - point.y) / 2) * 100;
  const ref = point.ref;

  return (
    <div
      data-point
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <div
        onPointerDown={onPointerDown}
        onClick={(e) => {
          e.stopPropagation();
          if (!canEdit) return;
          onClickEdit();
        }}
        className={cn(
          "group relative flex flex-col items-center gap-1",
          canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
      >
        {ref ? (
          <div
            className={cn(
              "relative overflow-hidden rounded-sm border-2 bg-background shadow-sm",
              point.is_self
                ? "border-foreground"
                : "border-background ring-1 ring-border",
            )}
            style={{
              width: 56,
              aspectRatio: `${ref.image_width ?? 4} / ${ref.image_height ?? 5}`,
            }}
          >
            <Image
              src={publicImageUrl(ref.image_path)}
              alt={ref.title ?? point.label ?? "ref"}
              fill
              sizes="64px"
              className="object-cover pointer-events-none"
              draggable={false}
            />
            {point.is_self ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-foreground p-0.5 text-background">
                <Star className="size-2.5 fill-current" />
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "rounded-full border-2 px-2 py-0.5 text-[11px] shadow-sm",
              point.is_self
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/60 bg-background text-foreground",
            )}
            style={
              point.color && !point.is_self
                ? { borderColor: point.color }
                : undefined
            }
          >
            {point.label || "?"}
          </div>
        )}
        {ref && point.label ? (
          <span className="max-w-[72px] truncate rounded bg-background/85 px-1 text-[10px] text-foreground shadow-sm">
            {point.label}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AxisLabel({
  value,
  canEdit,
  onSave,
  align,
  placeholder,
}: {
  value: string | null;
  canEdit: boolean;
  onSave: (next: string | null) => Promise<void> | void;
  align: "center" | "vertical";
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function startEdit() {
    setDraft(value ?? "");
    setEditing(true);
  }

  async function save() {
    const next = draft.trim();
    setEditing(false);
    if ((next || null) === (value || null)) return;
    await onSave(next || null);
  }

  const display = value || (canEdit ? placeholder : "");
  const labelClass = cn(
    "font-mono text-[11px] uppercase tracking-wider",
    value ? "text-foreground" : "text-muted-foreground",
  );

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        className={cn(
          "h-7 text-[12px]",
          align === "vertical" ? "w-20" : "w-full",
        )}
      />
    );
  }

  if (align === "vertical") {
    return (
      <button
        type="button"
        onClick={() => canEdit && startEdit()}
        disabled={!canEdit}
        className={cn(
          "w-20 break-words text-center",
          labelClass,
          canEdit && "hover:text-foreground",
        )}
      >
        {display || "—"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => canEdit && startEdit()}
      disabled={!canEdit}
      className={cn(
        "self-center text-center",
        labelClass,
        canEdit && "hover:text-foreground",
      )}
    >
      {display || "—"}
    </button>
  );
}

function AddPointDialog({
  open,
  coords,
  inspirationRefs,
  onClose,
  onConfirm,
}: {
  open: boolean;
  coords: { x: number; y: number };
  inspirationRefs: RefLite[];
  onClose: () => void;
  onConfirm: (input: {
    x: number;
    y: number;
    label: string | null;
    ref: RefLite | null;
    is_self: boolean;
  }) => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<"ref" | "label">("ref");
  const [label, setLabel] = useState("");
  const [isSelf, setIsSelf] = useState(false);
  const [busy, setBusy] = useState(false);
  // Default candidates: project's inspiration refs (familiar, contextual).
  // When the user types, we live-query refs across the whole library.
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RefLite[]>([]);

  useEffect(() => {
    if (tab !== "ref") return;
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("refs")
        .select("id, title, image_path, image_width, image_height, color_hex")
        .ilike("title", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(18);
      if (cancelled) return;
      if (!error && data) setSearchResults(data as RefLite[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, tab, query]);

  // Showing inspiration refs by default makes the project's mood pool the
  // first thing the eye lands on; typing anything switches to library-wide
  // search results.
  const candidates = query.trim() ? searchResults : inspirationRefs;

  async function pickRef(ref: RefLite) {
    setBusy(true);
    await onConfirm({
      x: coords.x,
      y: coords.y,
      label: ref.title,
      ref,
      is_self: isSelf,
    });
    setBusy(false);
  }

  async function confirmLabel() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    await onConfirm({
      x: coords.x,
      y: coords.y,
      label: trimmed,
      ref: null,
      is_self: isSelf,
    });
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>점 추가</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("ref")}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider",
                tab === "ref"
                  ? "border-foreground bg-foreground text-background"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              ref에서
            </button>
            <button
              type="button"
              onClick={() => setTab("label")}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider",
                tab === "label"
                  ? "border-foreground bg-foreground text-background"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              라벨로
            </button>
            <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={isSelf}
                onChange={(e) => setIsSelf(e.target.checked)}
                className="size-3.5"
              />
              우리 위치
            </label>
          </div>
          {tab === "ref" ? (
            <>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  inspirationRefs.length > 0
                    ? "영감 ref 또는 전체 ref에서 검색…"
                    : "ref 제목으로 검색…"
                }
              />
              {!query.trim() && inspirationRefs.length === 0 ? (
                <p className="font-mono text-[11px] text-muted-foreground">
                  검색어를 입력하거나 라벨로 추가해주세요.
                </p>
              ) : candidates.length === 0 ? (
                <p className="font-mono text-[11px] text-muted-foreground">
                  결과 없음
                </p>
              ) : (
                <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1">
                  {candidates.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => void pickRef(r)}
                        disabled={busy}
                        className="group block w-full overflow-hidden bg-muted text-left"
                      >
                        <div
                          className="relative w-full"
                          style={{
                            aspectRatio: `${r.image_width ?? 4} / ${r.image_height ?? 5}`,
                          }}
                        >
                          <Image
                            src={publicImageUrl(r.image_path)}
                            alt={r.title ?? "ref"}
                            fill
                            sizes="120px"
                            className="object-cover transition-opacity group-hover:opacity-80"
                          />
                        </div>
                        <p className="truncate px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {r.title ?? "untitled"}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 우리, 경쟁사 A"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmLabel();
              }}
            />
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            <X className="size-3" /> 닫기
          </Button>
          {tab === "label" ? (
            <Button
              type="button"
              onClick={() => void confirmLabel()}
              disabled={busy || !label.trim()}
            >
              추가
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPointDialog({
  open,
  point,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  point: PositioningPoint;
  onClose: () => void;
  onSave: (patch: Partial<PositioningPoint>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [label, setLabel] = useState(point.label ?? "");
  const [isSelf, setIsSelf] = useState(point.is_self);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await onSave({ label: label.trim() || null, is_self: isSelf });
    setBusy(false);
  }
  async function del() {
    if (!window.confirm("이 점을 삭제할까요?")) return;
    setBusy(true);
    await onDelete();
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>점 편집</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={point.ref?.title ?? "라벨"}
            autoFocus
          />
          <label className="inline-flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={isSelf}
              onChange={(e) => setIsSelf(e.target.checked)}
            />
            우리 위치 (강조)
          </label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void del()}
            disabled={busy}
            className="mr-auto text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3" /> 삭제
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            취소
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
