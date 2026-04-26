"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNickname } from "@/lib/nickname";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/client";

export default function NewDesignerForm() {
  const router = useRouter();
  const supabase = createClient();
  const { nickname, hydrated } = useNickname();

  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [website, setWebsite] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = name ? slugify(name) : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("designers")
      .insert({
        slug,
        name: name.trim(),
        origin: origin.trim() || null,
        website: website.trim() || null,
        bio: bio.trim() || null,
        created_by: nickname || null,
      })
      .select("slug")
      .single();
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/designer/${(data as { slug: string }).slug}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="이름">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {slug ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            slug: {slug}
          </p>
        ) : null}
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
          placeholder="짧은 메모. 마크다운은 v2에서…"
        />
      </Field>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {hydrated && nickname ? `as @${nickname}` : "닉네임 필요"}
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "저장 중…" : "추가"}
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
