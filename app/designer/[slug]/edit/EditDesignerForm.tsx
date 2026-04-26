"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { createClient } from "@/lib/supabase/client";

type Initial = {
  name: string;
  origin: string | null;
  website: string | null;
  bio: string | null;
};

export function EditDesignerForm({
  designerId,
  slug,
  createdBy,
  initial,
}: {
  designerId: string;
  slug: string;
  createdBy: string | null;
  initial: Initial;
}) {
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();

  const [name, setName] = useState(initial.name);
  const [origin, setOrigin] = useState(initial.origin ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        본인이 등록한 디자이너만 수정할 수 있어요.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("designers")
      .update({
        name: name.trim(),
        origin: origin.trim() || null,
        website: website.trim() || null,
        bio: bio.trim() || null,
      })
      .eq("id", designerId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    window.location.assign(`/designer/${encodeURIComponent(slug)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="이름">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
        <p className="font-mono text-[11px] text-muted-foreground">
          slug은 그대로 유지돼요: {slug}
        </p>
      </Field>
      <Field label="출신/국가">
        <Input
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="예: 서울, KR"
        />
      </Field>
      <Field label="웹사이트">
        <Input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://"
          inputMode="url"
        />
      </Field>
      <Field label="소개">
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
        />
      </Field>
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
