"use client";

import { useState } from "react";

import { NicknamePill } from "@/components/nickname-pill";
import { Button } from "@/components/ui/button";
import { ChipToggleRow } from "@/components/ui/chip-toggle-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TAG_PRESETS } from "@/components/upload/TagPresets";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";

export default function NewBoardForm() {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleKeyword(k: string) {
    const lower = k.toLowerCase();
    setKeywords((prev) =>
      prev.some((x) => x.toLowerCase() === lower)
        ? prev.filter((x) => x.toLowerCase() !== lower)
        : [...prev, k],
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
    const { data, error } = await supabase
      .from("boards")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        keywords,
        playlist_url: playlistUrl.trim() || null,
        created_by: nickname || null,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    window.location.assign(`/board/${(data as { id: string }).id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="제목">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="예: 표지 시안용"
        />
      </Field>
      <Field label="설명">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="이 보드의 목적을 적어주세요"
        />
      </Field>
      <Field label="키워드">
        <ChipToggleRow
          items={TAG_PRESETS}
          active={keywords}
          onToggle={toggleKeyword}
        />
      </Field>
      <Field label="플레이리스트 (선택)">
        <Input
          value={playlistUrl}
          onChange={(e) => setPlaylistUrl(e.target.value)}
          placeholder="Spotify / Apple Music / YouTube / SoundCloud URL"
          inputMode="url"
        />
      </Field>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between">
        {hydrated && nickname ? (
          <NicknamePill nickname={nickname} prefix="as @" link={false} />
        ) : (
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            닉네임 필요
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "만드는 중…" : "만들기"}
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
