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
import { useNickname } from "@/lib/nickname";
import { searchRefIdsClient } from "@/lib/refSearch";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { Ref } from "@/lib/types";

type RefLite = Pick<
  Ref,
  "id" | "title" | "image_path" | "image_width" | "image_height"
> & { reason?: string | null; added_by?: string | null };

export function InspirationRefs({
  projectId,
  initial,
}: {
  projectId: string;
  initial: RefLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const [linked, setLinked] = useState<RefLite[]>(initial);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [candidates, setCandidates] = useState<RefLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<RefLite | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = useMemo(
    () => new Set(linked.map((r) => r.id)),
    [linked],
  );

  // Debounce so we don't fan out 7 supabase requests per keystroke once
  // the broad search picks up — same pattern as the positioning map dialog.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!open || pending) return;
    let cancelled = false;
    void (async () => {
      const q = debouncedQuery.trim();
      // Empty query — show recent refs as baseline candidates.
      if (!q) {
        const { data, error } = await supabase
          .from("refs")
          .select("id, title, image_path, image_width, image_height")
          .order("created_at", { ascending: false })
          .limit(12);
        if (cancelled) return;
        if (error) setError(error.message);
        else
          setCandidates(
            (data as RefLite[]).filter((r) => !linkedIds.has(r.id)),
          );
        setSearching(false);
        return;
      }
      // Match the main /ref search across title / tags / OCR / designer /
      // notes via the shared client helper.
      setSearching(true);
      const ids = await searchRefIdsClient(supabase, q);
      if (cancelled) return;
      if (ids.size === 0) {
        setCandidates([]);
        setSearching(false);
        return;
      }
      const { data, error } = await supabase
        .from("refs")
        .select("id, title, image_path, image_width, image_height")
        .in("id", [...ids])
        .order("created_at", { ascending: false })
        .limit(18);
      if (cancelled) return;
      if (error) setError(error.message);
      else
        setCandidates(
          (data as RefLite[]).filter((r) => !linkedIds.has(r.id)),
        );
      setSearching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, open, debouncedQuery, linkedIds, pending]);

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
    const { error } = await supabase.from("project_refs").insert({
      project_id: projectId,
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
      .from("project_refs")
      .delete()
      .eq("project_id", projectId)
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
      .from("project_refs")
      .update({ reason: next })
      .eq("project_id", projectId)
      .eq("ref_id", refId);
    if (error) throw new Error(error.message);
    setLinked((prev) =>
      prev.map((r) => (r.id === refId ? { ...r, reason: next } : r)),
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Inspiration — {linked.length}
        </h2>
        {hydrated && nickname ? (
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
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
              >
                <Plus className="size-3" /> ref 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {pending ? "왜 이 ref를 추가하나요?" : "영감 ref 추가"}
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
                      <Image
                        src={publicImageUrl(pending.image_path)}
                        alt={pending.title ?? "ref"}
                        fill
                        sizes="120px"
                        className="object-cover"
                      />
                    </div>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={4}
                      placeholder="추가하는 이유 (선택). 어떤 점이 영감이 됐나요?"
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
                  <div className="relative">
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      // iOS Korean IME holds onChange until a syllable
                      // commits — without an explicit compositionend
                      // handler the user has to tap the input to flush
                      // the in-progress char into state. Mirror the
                      // committed value back into query here so search
                      // fires as soon as the IME finishes a character.
                      onCompositionEnd={(e) =>
                        setQuery((e.target as HTMLInputElement).value)
                      }
                      placeholder="제목·태그·OCR·디자이너로 검색…"
                    />
                    {searching || (query.trim() && query !== debouncedQuery) ? (
                      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                        <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                      </div>
                    ) : null}
                  </div>
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
      </header>

      {linked.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {linked.map((r) => (
            <li key={r.id} className="relative overflow-hidden bg-muted">
              {r.reason ? (
                <ReasonBadge
                  reason={r.reason}
                  addedBy={r.added_by ?? null}
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
                  <Image
                    src={publicImageUrl(r.image_path)}
                    alt={r.title ?? "ref"}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                </div>
              </Link>
              {hydrated && nickname ? (
                <button
                  type="button"
                  onClick={() => void remove(r.id)}
                  disabled={busy}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100 disabled:opacity-40"
                  aria-label="remove"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          연결된 ref가 없습니다.
        </p>
      )}
    </section>
  );
}
