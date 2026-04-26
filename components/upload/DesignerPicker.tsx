"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { getStoredNickname } from "@/lib/nickname";
import { slugify } from "@/lib/slug";
import type { Designer } from "@/lib/types";

export type DesignerLite = Pick<Designer, "id" | "slug" | "name">;

export function DesignerPicker({
  selected,
  onChange,
}: {
  selected: DesignerLite[];
  onChange: (next: DesignerLite[]) => void;
}) {
  const [all, setAll] = useState<DesignerLite[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOrigin, setNewOrigin] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("designers")
        .select("id, slug, name")
        .order("name");
      if (!cancelled) {
        if (error) setError(error.message);
        else setAll((data ?? []) as DesignerLite[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selectedIds = new Set(selected.map((d) => d.id));
    return all
      .filter((d) => !selectedIds.has(d.id))
      .filter((d) => (q ? d.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [all, query, selected]);

  function pick(d: DesignerLite) {
    onChange([...selected, d]);
    setQuery("");
  }
  function remove(id: string) {
    onChange(selected.filter((d) => d.id !== id));
  }

  async function createDesigner() {
    setError(null);
    const name = newName.trim();
    if (!name) {
      setError("이름을 입력해주세요.");
      return;
    }
    setCreating(true);
    try {
      const slug = slugify(name);
      const nickname = getStoredNickname() || null;
      const { data, error } = await supabase
        .from("designers")
        .insert({
          slug,
          name,
          origin: newOrigin.trim() || null,
          website: newWebsite.trim() || null,
          created_by: nickname,
        })
        .select("id, slug, name")
        .single();
      if (error) throw error;
      const created = data as DesignerLite;
      setAll((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      pick(created);
      setNewName("");
      setNewOrigin("");
      setNewWebsite("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "디자이너 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.map((d) => (
          <Badge key={d.id} className="gap-1 font-mono text-[11px]">
            {d.name}
            <button
              type="button"
              onClick={() => remove(d.id)}
              aria-label="remove"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        {selected.length === 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            no designer selected
          </span>
        ) : null}
      </div>
      <div className="flex items-stretch gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="디자이너 검색…"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-3.5" /> 새 디자이너
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 디자이너 추가</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-name">이름</Label>
                <Input
                  id="d-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-origin">출신/국가</Label>
                <Input
                  id="d-origin"
                  value={newOrigin}
                  onChange={(e) => setNewOrigin(e.target.value)}
                  placeholder="예: 서울, KR"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-web">웹사이트</Label>
                <Input
                  id="d-web"
                  value={newWebsite}
                  onChange={(e) => setNewWebsite(e.target.value)}
                  placeholder="https://"
                  inputMode="url"
                />
              </div>
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button onClick={createDesigner} disabled={creating}>
                {creating ? "생성 중…" : "추가"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {query && filtered.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-md border border-input p-1">
          {filtered.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => pick(d)}
                className="block w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-muted"
              >
                {d.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error && !open ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
