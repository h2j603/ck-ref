"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";

import {
  PositioningMap,
  type PositioningPoint,
  type PositioningAxes,
} from "./PositioningMap";

type RefLite = {
  id: string;
  title: string | null;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  color_hex: string | null;
};

export type PositioningMapInitial = {
  id: string;
  name: string | null;
  axes: PositioningAxes | null;
  points: PositioningPoint[];
  position: number;
};

export function PositioningMaps({
  projectId,
  createdBy,
  initial,
  inspirationRefs,
}: {
  projectId: string;
  createdBy: string | null;
  initial: PositioningMapInitial[];
  inspirationRefs: RefLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const canEdit = hydrated && nickname !== null && nickname === createdBy;

  const [maps, setMaps] = useState<PositioningMapInitial[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owner with no maps yet still gets the section header + "맵 추가" button
  // so they can spin one up. Read-only viewers with no maps see nothing.
  if (!canEdit && maps.length === 0) return null;

  async function addMap() {
    setError(null);
    setBusy(true);
    const nextPosition =
      maps.length > 0 ? Math.max(...maps.map((m) => m.position)) + 1 : 0;
    const { data, error } = await supabase
      .from("project_positioning_maps")
      .insert({
        project_id: projectId,
        name: null,
        position: nextPosition,
      })
      .select("id, name, position")
      .single();
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "맵 생성 실패");
      return;
    }
    const row = data as { id: string; name: string | null; position: number };
    setMaps((prev) => [
      ...prev,
      {
        id: row.id,
        name: row.name,
        axes: null,
        points: [],
        position: row.position,
      },
    ]);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          포지셔닝 맵 — {maps.length}
        </h2>
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => void addMap()}
            disabled={busy}
          >
            <Plus className="size-3" /> 맵 추가
          </Button>
        ) : null}
      </header>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {maps.length === 0 ? (
        canEdit ? (
          <p className="rounded-md border border-dashed border-border/60 p-4 text-center font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            아직 맵이 없습니다. 우상단 맵 추가로 시작해보세요.
          </p>
        ) : null
      ) : (
        // Horizontal carousel. Negative-margin trick lets the scroll area
        // bleed past the page padding so swipes feel natural on mobile.
        // Each map gets a fixed width so we get a real horizontal scroll
        // instead of a column of stacked sections.
        <div className="-mx-4 overflow-x-auto pb-2 sm:-mx-6">
          <div className="flex w-max gap-6 px-4 sm:px-6">
            {maps.map((m) => (
              <div
                key={m.id}
                className="w-[min(85vw,24rem)] shrink-0"
              >
                <PositioningMap
                  projectId={projectId}
                  mapId={m.id}
                  initialName={m.name}
                  createdBy={createdBy}
                  initialAxes={m.axes}
                  initialPoints={m.points}
                  inspirationRefs={inspirationRefs}
                  onRenamed={(next) =>
                    setMaps((prev) =>
                      prev.map((p) =>
                        p.id === m.id ? { ...p, name: next } : p,
                      ),
                    )
                  }
                  onDeleted={() =>
                    setMaps((prev) => prev.filter((p) => p.id !== m.id))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
