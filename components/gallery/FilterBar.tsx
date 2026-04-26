"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUCKET_SWATCH, HUE_BUCKETS, type HueBucket } from "@/lib/color";
import { GENRES, LANGUAGES, MEDIUMS } from "@/lib/types";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export function FilterBar({ allTags }: { allTags: string[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const genre = params.get("genre") ?? ALL;
  const medium = params.get("medium") ?? ALL;
  const language = params.get("language") ?? ALL;
  const hue = params.get("hue") as HueBucket | null;
  const activeTags = useMemo(
    () => params.getAll("tag").filter(Boolean),
    [params],
  );

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
    activeTags.length > 0;

  return (
    <section className="flex flex-col gap-4 pb-6">
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
        {hasFilter ? (
          <button
            type="button"
            onClick={() =>
              update({
                genre: null,
                medium: null,
                language: null,
                hue: null,
                tag: [],
              })
            }
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
