"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNickname } from "@/lib/nickname";

export default function GateForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const { nickname, setNickname, hydrated } = useNickname();
  const [password, setPassword] = useState("");
  const [localNickname, setLocalNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hydrated && nickname && !localNickname) {
      setLocalNickname(nickname);
    }
  }, [hydrated, nickname, localNickname]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedNickname = localNickname.trim();
    if (!trimmedNickname) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "인증에 실패했습니다.");
      }
      setNickname(trimmedNickname);
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증에 실패했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="nickname"
          className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
        >
          Nickname
        </Label>
        <Input
          id="nickname"
          value={localNickname}
          onChange={(e) => setLocalNickname(e.target.value)}
          placeholder="예: 김디"
          autoComplete="nickname"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="password"
          className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
        >
          Password
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Button type="submit" disabled={submitting}>
        {submitting ? "확인 중…" : "들어가기"}
      </Button>
    </form>
  );
}
