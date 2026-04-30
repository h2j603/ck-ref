"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUCKET_SWATCH, HUE_BUCKETS, type HueBucket } from "@/lib/color";
import { GENRES, LANGUAGES, MEDIUMS, REF_SORTS, type RefSort } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "__all__";

const SORT_LABELS: Record<RefSort, string> = {
  latest: "최신",
  rating: "별점",
  year_desc: "작업연도 ↓",
  year_asc: "작업연도 ↑",
};

export function FilterBar({ allTags }: { allTags: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const genre = params.get("genre") ?? ALL;
  const medium = params.get("medium") ?? ALL;
  const language = params.get("language") ?? ALL;
  const hue = params.get("hue") as HueBucket | null;
  const sortParam = params.get("sort");
  const sort: RefSort = (REF_SORTS as readonly string[]).includes(sortParam ?? "")
    ? (sortParam as RefSort)
    : "latest";
  const activeTags = useMemo(
    () => params.getAll("tag").filter(Boolean),
    [params],
  );
  const qParam = params.get("q") ?? "";
  // Mirror the URL ?q= into the controlled input draft. Tracking the
  // previous param and reconciling during render is the React-recommended
  // alternative to calling setState inside a useEffect for derived state.
  const [qDraft, setQDraft] = useState(qParam);
  const [lastQParam, setLastQParam] = useState(qParam);
  if (qParam !== lastQParam) {
    setLastQParam(qParam);
    setQDraft(qParam);
  }
  // We also keep a live ref to the DOM input. iOS holds onChange in
  // composition state during autocorrect / IME, which means qDraft can
  // be one keystroke behind the visible value when the user presses
  // Enter — that's the "Enter twice" bug. submitSearch reads the ref
  // instead of trusting state.
  const searchInputRef = useRef<HTMLInputElement>(null);

  // iOS Safari + React: synthetic onChange / onInput skip some
  // composition keystrokes. Attach a native `input` listener so qDraft
  // tracks the live value without going through React's event system.
  useEffect(() => {
    const el = searchInputRef.current;
    if (!el) return;
    const handler = () => setQDraft(el.value);
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  // Live search — push the URL update 120ms after qDraft settles so
  // results refresh almost the moment the user pauses typing. Form
  // submit (Enter / search icon) still bypasses the wait. Skip when
  // the draft already matches the URL to dodge the redundant replace
  // that would otherwise fire after submitSearch syncs both ends.
  useEffect(() => {
    const trimmed = qDraft.trim();
    if (trimmed === qParam) return;
    const id = window.setTimeout(() => {
      const sp = new URLSearchParams(params.toString());
      sp.delete("q");
      if (trimmed) sp.set("q", trimmed);
      const qs = sp.toString();
      router.replace(qs ? `/?${qs}` : "/");
    }, 120);
    return () => window.clearTimeout(id);
  }, [qDraft, qParam, params, router]);

  function update(next: Record<string, string | string[] | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      sp.delete(key);
      if (value === null || value === ALL || value === "") continue;
      if (Array.isArray(value)) {
        for (const v of value) sp.append(key, v);
      } else {
        sp.set(key, value);
      }
    }
    const qs = sp.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }

  function toggleTag(tag: string) {
    const next = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag];
    update({ tag: next });
  }

  const hasFilter =
    genre !== ALL ||
    medium !== ALL ||
    language !== ALL ||
    hue !== null ||
    qParam !== "" ||
    activeTags.length > 0;

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    // Live DOM value beats React state — see searchInputRef comment.
    const live = searchInputRef.current?.value ?? qDraft;
    const trimmed = live.trim();
    if (trimmed !== qDraft) setQDraft(trimmed);
    update({ q: trimmed || null });
  }

  return (
    <section className="flex flex-col gap-4 pb-6">
      <form
        onSubmit={submitSearch}
        className="relative flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchInputRef}
            value={qDraft}
            // Native input listener (see useEffect above) is the
            // primary keystroke source on iOS. React handlers stay for
            // fallback / controlled value.
            onChange={(e) => setQDraft(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            onCompositionEnd={(e) =>
              setQDraft((e.target as HTMLInputElement).value)
            }
            onKeyUp={(e) =>
              setQDraft((e.currentTarget as HTMLInputElement).value)
            }
            onBlur={(e) =>
              setQDraft((e.currentTarget as HTMLInputElement).value)
            }
            placeholder="검색 — 제목 / 태그 / 디자이너 / 노트"
            className="h-9 pl-8 pr-8 font-mono text-[12px]"
            inputMode="search"
            type="search"
          />
          {qParam ? (
            <button
              type="button"
              onClick={() => {
                setQDraft("");
                update({ q: null });
              }}
              aria-label="clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Genre"
          value={genre}
          options={GENRES as readonly string[]}
          onChange={(v) => update({ genre: v })}
        />
        <FilterSelect
          label="Medium"
          value={medium}
          options={MEDIUMS as readonly string[]}
          onChange={(v) => update({ medium: v })}
        />
        <FilterSelect
          label="Language"
          value={language}
          options={LANGUAGES as readonly string[]}
          onChange={(v) => update({ language: v })}
        />
        <Select
          value={sort}
          onValueChange={(v) =>
            update({ sort: v === "latest" ? null : (v as RefSort) })
          }
        >
          <SelectTrigger className="h-8 w-[140px] gap-2 border-dashed font-mono text-[11px] uppercase tracking-wider">
            <span className="text-muted-foreground">Sort</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REF_SORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {SORT_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilter ? (
          <button
            type="button"
            onClick={() => {
              setQDraft("");
              update({
                genre: null,
                medium: null,
                language: null,
                hue: null,
                q: null,
                tag: [],
              });
            }}
            className="ml-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            reset
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Color
        </span>
        {HUE_BUCKETS.map((b) => {
          const active = hue === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => update({ hue: active ? null : b })}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-input text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full border border-black/10"
                style={{ backgroundColor: BUCKET_SWATCH[b] }}
              />
              {b}
            </button>
          );
        })}
      </div>
      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className="focus:outline-none"
              >
                <Badge
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer font-mono text-[10px] tracking-wide"
                >
                  #{tag}
                </Badge>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[140px] gap-2 border-dashed font-mono text-[11px] uppercase tracking-wider">
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>all</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
