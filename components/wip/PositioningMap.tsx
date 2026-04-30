"use client";

import { Maximize2, Pencil, Star, Trash2, X } from "lucide-react";
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
import { searchRefIdsClient } from "@/lib/refSearch";
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

// Starter axis pairs grounded in patterns that actually show up in brand
// strategy decks. The first four (price × quality, tone × era, motivation,
// audience) are the dimensions clients argue about most; the last two are
// visual-styling decisions designers make once positioning is set. Order
// reflects rough usage frequency.
const AXIS_PRESETS: { name: string; axes: PositioningAxes }[] = [
  {
    // The canonical perceptual map — every brand positioning template uses
    // some flavour of this. Y-axis is product / craft level, not just
    // sticker price, which is what makes price+quality interesting.
    name: "가격 × 품질",
    axes: {
      x_low_label: "저렴",
      x_high_label: "프리미엄",
      y_low_label: "보급형",
      y_high_label: "고품질",
    },
  },
  {
    // Brand-personality matrix: how serious does the brand take itself,
    // and where does it sit on the era spectrum.
    name: "톤 × 시대감",
    axes: {
      x_low_label: "진지",
      x_high_label: "유쾌",
      y_low_label: "클래식",
      y_high_label: "모던",
    },
  },
  {
    // Purchase motivation. Common in B2B vs lifestyle audits to check if a
    // brand's voice matches the actual reason people buy.
    name: "구매 동기",
    axes: {
      x_low_label: "기능적",
      x_high_label: "감성적",
      y_low_label: "합리적",
      y_high_label: "충동적",
    },
  },
  {
    // Audience framing. "대중적 vs 전문가용" is the most concrete way to
    // describe accessibility, paired with the relationship axis.
    name: "타겟",
    axes: {
      x_low_label: "대중적",
      x_high_label: "전문가용",
      y_low_label: "친근함",
      y_high_label: "권위적",
    },
  },
  {
    // Visual density × energy — the two sliders designers reach for first
    // when comping a system.
    name: "비주얼",
    axes: {
      x_low_label: "미니멀",
      x_high_label: "장식적",
      y_low_label: "차분",
      y_high_label: "강렬",
    },
  },
  {
    // Material / texture audit. Useful when refs span print + digital and
    // you want to see whether the mood pool leans warm-natural or cool-
    // engineered.
    name: "질감",
    axes: {
      x_low_label: "자연",
      x_high_label: "인공",
      y_low_label: "따뜻함",
      y_high_label: "차가움",
    },
  },
];

export function PositioningMap({
  projectId,
  mapId,
  initialName,
  createdBy,
  initialAxes,
  initialPoints,
  inspirationRefs,
  onRenamed,
  onDeleted,
}: {
  projectId: string;
  mapId: string;
  initialName: string | null;
  createdBy: string | null;
  initialAxes: PositioningAxes | null;
  initialPoints: PositioningPoint[];
  inspirationRefs: RefLite[];
  onRenamed?: (next: string | null) => void;
  onDeleted?: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const canEdit = hydrated && nickname !== null && nickname === createdBy;

  const [name, setName] = useState<string | null>(initialName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialName ?? "");
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
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Read-only viewers shouldn't see an empty grid; hide the whole map until
  // the owner has plotted something, labelled an axis, or named the map.
  const hasContent =
    points.length > 0 ||
    Boolean(name) ||
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
    const { error } = await supabase
      .from("project_positioning_maps")
      .update({ ...next, updated_at: new Date().toISOString() })
      .eq("id", mapId);
    if (error) {
      setError(error.message);
      setAxes(previous);
    }
  }

  async function persistName(next: string | null) {
    setError(null);
    const previous = name;
    setName(next);
    const { error } = await supabase
      .from("project_positioning_maps")
      .update({ name: next, updated_at: new Date().toISOString() })
      .eq("id", mapId);
    if (error) {
      setError(error.message);
      setName(previous);
      return;
    }
    onRenamed?.(next);
  }

  async function deleteMap() {
    if (!window.confirm("이 맵과 점들을 모두 삭제할까요?")) return;
    setError(null);
    const { error } = await supabase
      .from("project_positioning_maps")
      .delete()
      .eq("id", mapId);
    if (error) {
      setError(error.message);
      return;
    }
    onDeleted?.();
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
        map_id: mapId,
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

  // The board (axes + grid + points) is rendered either inline at its
  // normal size or inside a fullscreen Dialog when `expanded` is on. Only
  // one instance is ever in the DOM at a time, so containerRef stays
  // attached to whichever is active and drag/click coords resolve cleanly.
  const renderBoard = () => (
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
              // eslint-disable-next-line react-hooks/refs -- the ref write only happens inside the event handler, not during render
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
  );

  const renderPresets = () =>
    canEdit &&
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
    ) : null;

  // Map name is editable inline. Click pencil → input; Enter / blur saves;
  // Escape cancels. Empty name renders as "(이름 없음)" placeholder so each
  // map is still visually distinct in the stack.
  function commitName() {
    const next = nameDraft.trim();
    setEditingName(false);
    if ((next || null) === (name || null)) return;
    void persistName(next || null);
  }

  const titleNode = editingName ? (
    <Input
      autoFocus
      value={nameDraft}
      onChange={(e) => setNameDraft(e.target.value)}
      onBlur={commitName}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitName();
        if (e.key === "Escape") {
          setNameDraft(name ?? "");
          setEditingName(false);
        }
      }}
      placeholder="맵 이름"
      className="h-7 max-w-[14rem] text-[12px]"
    />
  ) : (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => {
        if (!canEdit) return;
        setNameDraft(name ?? "");
        setEditingName(true);
      }}
      className={cn(
        "font-mono text-[11px] uppercase tracking-widest",
        name ? "text-foreground" : "text-muted-foreground",
        canEdit && "hover:text-foreground",
      )}
    >
      {name || "(이름 없음)"} — {points.length}
    </button>
  );

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          {titleNode}
          {canEdit && !editingName ? (
            <button
              type="button"
              onClick={() => {
                setNameDraft(name ?? "");
                setEditingName(true);
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="이름 수정"
              title="이름 수정"
            >
              <Pencil className="size-3" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <p className="hidden font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
              빈 곳 클릭으로 추가 · 드래그로 이동
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="확대"
            title="확대"
          >
            <Maximize2 className="size-3.5" />
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void deleteMap()}
              className="text-muted-foreground hover:text-destructive"
              aria-label="맵 삭제"
              title="맵 삭제"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      </header>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {!expanded ? renderPresets() : null}
      {!expanded ? renderBoard() : null}

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

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[min(96vh,96vw)] w-[min(96vw,96vh)] max-w-none flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {name || "(이름 없음)"} — {points.length}
            </DialogTitle>
          </DialogHeader>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {renderPresets()}
          <div className="min-h-0 flex-1">{expanded ? renderBoard() : null}</div>
        </DialogContent>
      </Dialog>
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
                ? "border-lime-400"
                : "border-background ring-1 ring-border",
            )}
            style={{
              width: 36,
              aspectRatio: `${ref.image_width ?? 4} / ${ref.image_height ?? 5}`,
            }}
          >
            <Image
              src={publicImageUrl(ref.image_path)}
              alt={ref.title ?? point.label ?? "ref"}
              fill
              sizes="48px"
              className="object-cover pointer-events-none"
              draggable={false}
            />
            {point.is_self ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-lime-400 p-0.5 text-lime-950">
                <Star className="size-2.5 fill-current" />
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              "rounded-full border-2 px-2 py-0.5 text-[11px] shadow-sm",
              point.is_self
                ? "border-lime-500 bg-lime-400 text-lime-950"
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
  // When the user types, we live-query refs across the whole library —
  // pre-OCR this dialog used a single ilike on title with no debounce,
  // and that simple per-keystroke trigger is what the user remembers
  // working reliably. Keep the broader search dimensions but drop the
  // debounce indirection so the search is the only thing in the chain.
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RefLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (tab !== "ref") return;
    let cancelled = false;
    void (async () => {
      const q = query.trim();
      if (!q) {
        if (!cancelled) {
          setSearchResults([]);
          setSearching(false);
        }
        return;
      }
      if (!cancelled) setSearching(true);
      // Mirror the main /ref search: match across title, tags, OCR text,
      // designer name, and note bodies. searchRefIdsClient returns the
      // matching ids; we then hydrate the columns the dialog renders.
      const ids = await searchRefIdsClient(supabase, q);
      if (cancelled) return;
      if (ids.size === 0) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      const { data, error } = await supabase
        .from("refs")
        .select("id, title, image_path, image_width, image_height, color_hex")
        .in("id", [...ids])
        .order("created_at", { ascending: false })
        .limit(18);
      if (cancelled) return;
      if (!error && data) setSearchResults(data as RefLite[]);
      setSearching(false);
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
              <div className="relative">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  // iOS Safari puts text inputs into a composition state
                  // for autocorrect (English) and IME (Korean), and React
                  // onChange doesn't fire reliably mid-composition. Two
                  // layers of defence:
                  //   1. Tell iOS to skip auto-correct / auto-cap /
                  //      spellcheck entirely so search inputs never
                  //      enter composition in the first place.
                  //   2. Mirror the live value on key release / blur /
                  //      compositionend in case something still slips
                  //      through (e.g. swipe-to-type).
                  autoCorrect="off"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  onCompositionEnd={(e) =>
                    setQuery((e.target as HTMLInputElement).value)
                  }
                  onKeyUp={(e) =>
                    setQuery((e.currentTarget as HTMLInputElement).value)
                  }
                  onBlur={(e) =>
                    setQuery((e.currentTarget as HTMLInputElement).value)
                  }
                  placeholder={
                    inspirationRefs.length > 0
                      ? "영감 ref 또는 전체 ref에서 검색…"
                      : "ref 제목·태그·OCR로 검색…"
                  }
                />
                {searching ? (
                  <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                    <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                  </div>
                ) : null}
              </div>
              {!query.trim() && inspirationRefs.length === 0 ? (
                <p className="font-mono text-[11px] text-muted-foreground">
                  검색어를 입력하거나 라벨로 추가해주세요.
                </p>
              ) : candidates.length === 0 && !searching ? (
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
