"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchRefIdsClient } from "@/lib/refSearch";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { Project, RefGrid } from "@/lib/types";

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

// Apply behaviour: pick a target → navigate to that target's grid
// editor with `?from_grid=<id>` in the URL. The destination opens its
// analyzer pre-populated with the source spec, lets the user adjust to
// the new image's proportions, then save explicitly. We deliberately
// don't insert a copy here — too easy to end up with grids that don't
// match the target image's aspect.
export function ApplyGridDialog({
  grid,
  sourceRefId,
}: {
  grid: RefGrid;
  // Kept for prop-stability with earlier callers; image meta is only
  // used by the project apply flow which has been moved to
  // navigation-then-confirm and reads source metadata server-side.
  sourceRefId: string;
  sourceImagePath?: string;
  sourceWidth?: number;
  sourceHeight?: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("ref");
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

  function applyToRef(target: RefRow) {
    setError(null);
    setOpen(false);
    if (target.id === sourceRefId) return;
    router.push(`/ref/${target.id}?from_grid=${grid.id}`);
  }

  function applyToProject(project: { id: string }) {
    setError(null);
    setOpen(false);
    router.push(`/wip/${project.id}?from_grid=${grid.id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
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
                      onClick={() => applyToRef(r)}
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
                    onClick={() => applyToProject(p)}
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

          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            대상을 고르면 그쪽 그리드 분석기로 이동해 미리채워진 상태로
            확인·조정 후 저장할 수 있어요.
          </p>
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
