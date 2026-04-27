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
import { useNickname } from "@/lib/nickname";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { Ref } from "@/lib/types";

type RefLite = Pick<
  Ref,
  "id" | "title" | "image_path" | "image_width" | "image_height"
>;

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
  const [candidates, setCandidates] = useState<RefLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = useMemo(
    () => new Set(linked.map((r) => r.id)),
    [linked],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const q = query.trim();
      let req = supabase
        .from("refs")
        .select("id, title, image_path, image_width, image_height")
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
  }, [supabase, open, query, linkedIds]);

  async function add(ref: RefLite) {
    setError(null);
    setBusy(true);
    const { error } = await supabase.from("project_refs").insert({
      project_id: projectId,
      ref_id: ref.id,
      added_by: nickname || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setLinked((prev) => [...prev, ref]);
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

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Inspiration — {linked.length}
        </h2>
        {hydrated && nickname ? (
          <Dialog open={open} onOpenChange={setOpen}>
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
                <DialogTitle>영감 ref 추가</DialogTitle>
              </DialogHeader>
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
                          onClick={() => void add(r)}
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
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  닫기
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </header>

      {linked.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {linked.map((r) => (
            <li key={r.id} className="group relative overflow-hidden bg-muted">
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
