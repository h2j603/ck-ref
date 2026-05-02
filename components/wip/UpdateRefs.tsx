"use client";

import { Plus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReasonBadge } from "@/components/wip/ReasonBadge";
import { isVideoPath } from "@/lib/media";
import { useNickname } from "@/lib/nickname";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { Ref } from "@/lib/types";

type RefLite = Pick<
  Ref,
  "id" | "title" | "image_path" | "image_width" | "image_height"
> & { reason?: string | null; added_by?: string | null };

// Some refs have a video as their cover (mp4 / webm / mov / m4v). A
// plain <Image> on those paths renders broken; mirror the masonry's
// muted-loop preview so the thumbnail still gives a sense of the work.
function RefThumb({
  path,
  alt,
  imageClassName = "object-cover",
}: {
  path: string;
  alt: string;
  imageClassName?: string;
}) {
  const url = publicImageUrl(path);
  if (isVideoPath(path)) {
    return (
      <video
        src={url}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }
  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes="120px"
      className={imageClassName}
    />
  );
}

export function UpdateRefs({
  updateId,
  initial,
}: {
  updateId: string;
  initial: RefLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const [linked, setLinked] = useState<RefLite[]>(initial);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<RefLite[]>([]);
  const [pending, setPending] = useState<RefLite | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydratedFromDb, setHydratedFromDb] = useState(false);

  const linkedIds = useMemo(
    () => new Set(linked.map((r) => r.id)),
    [linked],
  );

  // The page loads UpdateCards without per-update refs (server-side cost),
  // so on first mount fetch refs for this update lazily.
  useEffect(() => {
    if (hydratedFromDb) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("project_update_refs")
        .select(
          `reason, added_by, ref:refs(id, title, image_path, image_width, image_height)`,
        )
        .eq("project_update_id", updateId);
      if (cancelled) return;
      if (error) return;
      type Row = {
        reason: string | null;
        added_by: string | null;
        ref:
          | (Pick<
              Ref,
              "id" | "title" | "image_path" | "image_width" | "image_height"
            > | null)
          | Pick<
              Ref,
              "id" | "title" | "image_path" | "image_width" | "image_height"
            >[];
      };
      const rows = (data ?? []) as unknown as Row[];
      const flat: RefLite[] = [];
      for (const row of rows) {
        const r = Array.isArray(row.ref) ? row.ref[0] ?? null : row.ref;
        if (!r) continue;
        flat.push({ ...r, reason: row.reason, added_by: row.added_by });
      }
      setLinked(flat);
      setHydratedFromDb(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, updateId, hydratedFromDb]);

  useEffect(() => {
    if (!open || pending) return;
    let cancelled = false;
    void (async () => {
      const q = query.trim();
      let req = supabase
        .from("refs")
        .select("id, title, image_path, image_width, image_height")
        .eq("board_only", false)
        .order("created_at", { ascending: false })
        .limit(12);
      if (q) req = req.ilike("title", `%${q}%`);
      const { data, error } = await req;
      if (cancelled) return;
      if (error) setError(error.message);
      else
        setCandidates(
          (data as RefLite[]).filter((r) => !linkedIds.has(r.id)),
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, open, query, linkedIds, pending]);

  function startAdd(ref: RefLite) {
    setReason("");
    setError(null);
    setPending(ref);
  }

  async function confirmAdd() {
    if (!pending) return;
    setError(null);
    setBusy(true);
    const trimmed = reason.trim();
    const { error } = await supabase.from("project_update_refs").insert({
      project_update_id: updateId,
      ref_id: pending.id,
      reason: trimmed || null,
      added_by: nickname || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setLinked((prev) => [
      ...prev,
      { ...pending, reason: trimmed || null, added_by: nickname || null },
    ]);
    setPending(null);
    setReason("");
    setOpen(false);
  }

  async function remove(refId: string) {
    setError(null);
    setBusy(true);
    const { error } = await supabase
      .from("project_update_refs")
      .delete()
      .eq("project_update_id", updateId)
      .eq("ref_id", refId);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setLinked((prev) => prev.filter((r) => r.id !== refId));
  }

  async function updateReason(refId: string, next: string | null) {
    const { error } = await supabase
      .from("project_update_refs")
      .update({ reason: next })
      .eq("project_update_id", updateId)
      .eq("ref_id", refId);
    if (error) throw new Error(error.message);
    setLinked((prev) =>
      prev.map((r) => (r.id === refId ? { ...r, reason: next } : r)),
    );
  }

  const canEdit = hydrated && !!nickname;

  // Compact: nothing to show, no add button → render nothing.
  if (linked.length === 0 && !canEdit) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          참고 ref{linked.length > 0 ? ` — ${linked.length}` : ""}
        </p>
        {canEdit ? (
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) {
                setPending(null);
                setReason("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[10px]"
              >
                <Plus className="size-3" /> 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {pending ? "왜 이 ref를 추가하나요?" : "참고 ref 추가"}
                </DialogTitle>
              </DialogHeader>
              {pending ? (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <div
                      className="relative w-24 shrink-0 overflow-hidden bg-muted"
                      style={{
                        aspectRatio: `${pending.image_width ?? 4} / ${pending.image_height ?? 5}`,
                      }}
                    >
                      <RefThumb
                        path={pending.image_path}
                        alt={pending.title ?? "ref"}
                      />
                    </div>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={4}
                      placeholder="이 업데이트에 어떻게 영감이 됐나요? (선택)"
                      className="flex-1 text-sm"
                      disabled={busy}
                    />
                  </div>
                  {error ? (
                    <p className="text-xs text-destructive">{error}</p>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="제목으로 검색…"
                  />
                  {candidates.length > 0 ? (
                    <ul className="grid grid-cols-3 gap-2">
                      {candidates.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => startAdd(r)}
                            disabled={busy}
                            className="group block w-full overflow-hidden bg-muted text-left"
                          >
                            <div
                              className="relative w-full"
                              style={{
                                aspectRatio: `${r.image_width ?? 4} / ${r.image_height ?? 5}`,
                              }}
                            >
                              <RefThumb
                                path={r.image_path}
                                alt={r.title ?? "ref"}
                                imageClassName="object-cover transition-opacity group-hover:opacity-80"
                              />
                            </div>
                            <p className="truncate px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {r.title ?? "untitled"}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      결과 없음
                    </p>
                  )}
                  {error ? (
                    <p className="text-xs text-destructive">{error}</p>
                  ) : null}
                </div>
              )}
              <DialogFooter>
                {pending ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPending(null);
                        setReason("");
                      }}
                      disabled={busy}
                    >
                      뒤로
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void confirmAdd()}
                      disabled={busy}
                    >
                      {busy ? "추가 중…" : "추가"}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    disabled={busy}
                  >
                    닫기
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      {linked.length > 0 ? (
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {linked.map((r) => (
            <li key={r.id} className="relative overflow-hidden bg-muted">
              {r.reason ? (
                <ReasonBadge
                  reason={r.reason}
                  addedBy={r.added_by ?? null}
                  compact
                  onSave={(next) => updateReason(r.id, next)}
                  onClear={() => updateReason(r.id, null)}
                />
              ) : null}
              <Link
                href={`/ref/${r.id}`}
                className="block"
                aria-label={r.title ?? "ref"}
              >
                <div
                  className="relative w-full"
                  style={{
                    aspectRatio: `${r.image_width ?? 4} / ${r.image_height ?? 5}`,
                  }}
                >
                  <RefThumb path={r.image_path} alt={r.title ?? "ref"} />
                </div>
              </Link>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  disabled={busy}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100 disabled:opacity-40"
                  aria-label="remove"
                >
                  <X className="size-2.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
