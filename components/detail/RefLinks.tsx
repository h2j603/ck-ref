"use client";

import { Plus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNickname } from "@/lib/nickname";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { LinkedRef } from "@/lib/queries";

function canonical(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function RefLinks({
  refId,
  initial,
}: {
  refId: string;
  initial: LinkedRef[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const { nickname, hydrated } = useNickname();
  const [linked, setLinked] = useState<LinkedRef[]>(initial);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<LinkedRef[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = useMemo(() => new Set(linked.map((r) => r.id)), [linked]);

  useEffect(() => {
    if (!picking) return;
    let cancelled = false;
    void (async () => {
      const q = query.trim();
      let req = supabase
        .from("refs")
        .select("id, title, year, image_path, image_width, image_height")
        .neq("id", refId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (q) req = req.ilike("title", `%${q}%`);
      const { data, error } = await req;
      if (cancelled) return;
      if (error) setError(error.message);
      else
        setCandidates(
          (data as LinkedRef[]).filter((r) => !linkedIds.has(r.id)),
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, picking, query, refId, linkedIds]);

  async function addLink(other: LinkedRef) {
    setError(null);
    const [a, b] = canonical(refId, other.id);
    setBusy(true);
    const { error } = await supabase.from("ref_links").insert({
      a_id: a,
      b_id: b,
      created_by: nickname || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setLinked((prev) => [...prev, other]);
    setQuery("");
  }

  async function removeLink(otherId: string) {
    setError(null);
    const [a, b] = canonical(refId, otherId);
    setBusy(true);
    const { error } = await supabase
      .from("ref_links")
      .delete()
      .eq("a_id", a)
      .eq("b_id", b);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setLinked((prev) => prev.filter((r) => r.id !== otherId));
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between border-b border-border/60 pb-2">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Linked — {linked.length}
        </h2>
        {hydrated && nickname ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={() => setPicking((p) => !p)}
          >
            <Plus className="size-3" /> {picking ? "취소" : "추가"}
          </Button>
        ) : null}
      </header>

      {linked.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {linked.map((r) => (
            <li key={r.id} className="group relative overflow-hidden bg-muted">
              <Link
                href={`/ref/${r.id}`}
                className="block"
                aria-label={r.title ?? "linked ref"}
              >
                <div
                  className="relative w-full"
                  style={{
                    aspectRatio: `${r.image_width ?? 4} / ${r.image_height ?? 5}`,
                  }}
                >
                  <Image
                    src={publicImageUrl(r.image_path)}
                    alt={r.title ?? "linked ref"}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                </div>
              </Link>
              {hydrated && nickname ? (
                <button
                  type="button"
                  onClick={() => removeLink(r.id)}
                  disabled={busy}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100 disabled:opacity-40"
                  aria-label="remove link"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          연관된 작업이 없습니다.
        </p>
      )}

      {picking ? (
        <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
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
                    onClick={() => addLink(r)}
                    disabled={busy}
                    className="group block w-full overflow-hidden bg-muted text-left"
                    aria-label={`link ${r.title ?? "untitled"}`}
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
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
