"use client";

import { Loader2, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useNickname } from "@/lib/nickname";
import { searchRefIdsClient } from "@/lib/refSearch";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { GridSpec, Project, RefGrid } from "@/lib/types";

// Reusable: copies the spec of a saved RefGrid onto another ref or onto
// a WIP project. Source ref's image metadata is also stashed on the
// project copy so the project page can preview the grid against the
// original reference image.
type RefRow = {
  id: string;
  title: string | null;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
};

type Mode = "ref" | "project";

export function ApplyGridDialog({
  grid,
  sourceRefId,
  sourceImagePath,
  sourceWidth,
  sourceHeight,
}: {
  grid: RefGrid;
  sourceRefId: string;
  sourceImagePath: string;
  sourceWidth: number;
  sourceHeight: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname } = useNickname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("ref");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref search
  const [refQuery, setRefQuery] = useState("");
  const [refResults, setRefResults] = useState<RefRow[]>([]);
  const refSearchSeq = useRef(0);

  // Projects (loaded on dialog open)
  const [projects, setProjects] = useState<
    Pick<Project, "id" | "title" | "status">[]
  >([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  useEffect(() => {
    if (!open || projectsLoaded) return;
    void (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, title, status")
        .order("created_at", { ascending: false })
        .limit(50);
      setProjects(data ?? []);
      setProjectsLoaded(true);
    })();
  }, [open, projectsLoaded, supabase]);

  useEffect(() => {
    if (!open || mode !== "ref") return;
    const seq = ++refSearchSeq.current;
    const q = refQuery.trim();
    void (async () => {
      // Empty query → most-recent N refs (excluding source).
      if (!q) {
        const { data } = await supabase
          .from("refs")
          .select("id, title, image_path, image_width, image_height")
          .neq("id", sourceRefId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (refSearchSeq.current === seq) setRefResults(data ?? []);
        return;
      }
      const ids = await searchRefIdsClient(supabase, q);
      ids.delete(sourceRefId);
      if (ids.size === 0) {
        if (refSearchSeq.current === seq) setRefResults([]);
        return;
      }
      const { data } = await supabase
        .from("refs")
        .select("id, title, image_path, image_width, image_height")
        .in("id", [...ids])
        .limit(40);
      if (refSearchSeq.current === seq) setRefResults(data ?? []);
    })();
  }, [open, mode, refQuery, sourceRefId, supabase]);

  function specPayload(): GridSpec & { created_by: string | null } {
    return {
      grid_type: grid.grid_type,
      cols: grid.cols,
      rowscount: grid.rowscount,
      margin_top: grid.margin_top,
      margin_right: grid.margin_right,
      margin_bottom: grid.margin_bottom,
      margin_left: grid.margin_left,
      gutter_x: grid.gutter_x,
      gutter_y: grid.gutter_y,
      baseline: grid.baseline,
      custom_v: grid.custom_v,
      custom_h: grid.custom_h,
      label: grid.label,
      notes: grid.notes,
      created_by: nickname,
    };
  }

  async function applyToRef(target: RefRow) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("ref_grids")
      .insert({ ref_id: target.id, ...specPayload() });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(`레퍼 "${target.title ?? "untitled"}" 에 적용됨`);
  }

  async function applyToProject(project: { id: string; title: string }) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from("project_grids").insert({
      project_id: project.id,
      source_ref_id: sourceRefId,
      source_image_path: sourceImagePath,
      source_width: sourceWidth,
      source_height: sourceHeight,
      ...specPayload(),
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(`프로젝트 "${project.title}" 에 적용됨`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setDone(null);
          setError(null);
          setRefQuery("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <Send className="size-3" /> 다른 곳에 적용
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>그리드 적용</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5">
            <ModeChip
              active={mode === "ref"}
              onClick={() => setMode("ref")}
              label="다른 레퍼"
            />
            <ModeChip
              active={mode === "project"}
              onClick={() => setMode("project")}
              label="WIP 프로젝트"
            />
          </div>

          {mode === "ref" ? (
            <>
              <Input
                value={refQuery}
                onChange={(e) => setRefQuery(e.target.value)}
                placeholder="레퍼 검색 (제목·디자이너·태그·OCR)"
              />
              <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {refResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void applyToRef(r)}
                      className="flex w-full items-center gap-2 rounded-md border border-transparent p-1.5 text-left hover:border-input"
                    >
                      <div
                        className="size-10 shrink-0 rounded-sm bg-muted bg-cover bg-center"
                        style={{
                          backgroundImage: `url(${publicImageUrl(r.image_path)})`,
                        }}
                      />
                      <span className="truncate text-sm">
                        {r.title ?? "untitled"}
                      </span>
                    </button>
                  </li>
                ))}
                {refResults.length === 0 ? (
                  <li className="px-1 py-2 text-xs text-muted-foreground">
                    검색 결과 없음
                  </li>
                ) : null}
              </ul>
            </>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void applyToProject(p)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent p-2 text-left hover:border-input"
                  >
                    <span className="truncate text-sm">{p.title}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.status}
                    </span>
                  </button>
                </li>
              ))}
              {projectsLoaded && projects.length === 0 ? (
                <li className="px-1 py-2 text-xs text-muted-foreground">
                  프로젝트가 없어요
                </li>
              ) : null}
              {!projectsLoaded ? (
                <li className="flex items-center gap-1.5 px-1 py-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> 불러오는 중
                </li>
              ) : null}
            </ul>
          )}

          {done ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
              <span>{done}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDone(null)}
              >
                또 적용
              </Button>
            </div>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeChip({
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
      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
