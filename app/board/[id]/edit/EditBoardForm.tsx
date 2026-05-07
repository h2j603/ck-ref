"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ChipToggleRow } from "@/components/ui/chip-toggle-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TAG_PRESETS } from "@/components/upload/TagPresets";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";

export function EditBoardForm({
  boardId,
  createdBy,
  initial,
}: {
  boardId: string;
  createdBy: string | null;
  initial: {
    title: string;
    description: string | null;
    positive_keywords: string[];
    negative_keywords: string[];
    playlist_url: string | null;
    pairing_a: string | null;
    pairing_b: string | null;
    is_private: boolean;
  };
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [positiveKeywords, setPositiveKeywords] = useState<string[]>(
    initial.positive_keywords ?? [],
  );
  const [negativeKeywords, setNegativeKeywords] = useState<string[]>(
    initial.negative_keywords ?? [],
  );
  const [playlistUrl, setPlaylistUrl] = useState(initial.playlist_url ?? "");
  const [pairingA, setPairingA] = useState(initial.pairing_a ?? "");
  const [pairingB, setPairingB] = useState(initial.pairing_b ?? "");
  const [isPrivate, setIsPrivate] = useState(initial.is_private);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function makeToggle(
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    return (k: string) => {
      const lower = k.toLowerCase();
      setter((prev) =>
        prev.some((x) => x.toLowerCase() === lower)
          ? prev.filter((x) => x.toLowerCase() !== lower)
          : [...prev, k],
      );
    };
  }
  const togglePositive = makeToggle(setPositiveKeywords);
  const toggleNegative = makeToggle(setNegativeKeywords);

  if (!hydrated) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        loading…
      </p>
    );
  }
  if (!createdBy || nickname !== createdBy) {
    return (
      <p className="text-sm text-muted-foreground">
        본인이 만든 보드만 수정할 수 있어요.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("boards")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        positive_keywords: positiveKeywords,
        negative_keywords: negativeKeywords,
        playlist_url: playlistUrl.trim() || null,
        pairing_a: pairingA.trim() || null,
        pairing_b: pairingB.trim() || null,
        is_private: isPrivate,
      })
      .eq("id", boardId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    window.location.assign(`/board/${boardId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="제목">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Field label="설명">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </Field>
      <Field label="포지티브 키워드">
        <ChipToggleRow
          items={TAG_PRESETS}
          active={positiveKeywords}
          onToggle={togglePositive}
          tone="positive"
        />
      </Field>
      <Field label="네거티브 키워드">
        <ChipToggleRow
          items={TAG_PRESETS}
          active={negativeKeywords}
          onToggle={toggleNegative}
          tone="negative"
        />
      </Field>
      <Field label="페어링 (A × B)">
        <div className="flex items-center gap-2">
          <Input
            value={pairingA}
            onChange={(e) => setPairingA(e.target.value)}
            placeholder="예: Helvetica"
          />
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            ×
          </span>
          <Input
            value={pairingB}
            onChange={(e) => setPairingB(e.target.value)}
            placeholder="예: 보사노바"
          />
        </div>
      </Field>
      <Field label="플레이리스트">
        <Input
          value={playlistUrl}
          onChange={(e) => setPlaylistUrl(e.target.value)}
          placeholder="Spotify / Apple Music / YouTube / SoundCloud URL"
          inputMode="url"
        />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="size-3"
        />
        비공개 — 만든 사람만 볼 수 있음
      </label>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "저장 중…" : "저장"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
