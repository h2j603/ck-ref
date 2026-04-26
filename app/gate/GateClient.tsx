"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNickname } from "@/lib/nickname";
import { PROFILES, type Profile } from "@/lib/profiles";
import { cn } from "@/lib/utils";

export default function GateClient({
  initialAuthed,
  redirectTo,
}: {
  initialAuthed: boolean;
  redirectTo: string;
}) {
  const [authed, setAuthed] = useState(initialAuthed);

  if (!authed) {
    return <PasswordForm onSuccess={() => setAuthed(true)} />;
  }
  return <ProfilePicker redirectTo={redirectTo} />;
}

function PasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증에 실패했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-4"
    >
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
          autoFocus
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

function ProfilePicker({ redirectTo }: { redirectTo: string }) {
  const { nickname, setNickname } = useNickname();
  const [pendingNick, setPendingNick] = useState<string | null>(null);

  function pick(profile: Profile) {
    setPendingNick(profile.nickname);
    setNickname(profile.nickname);
    // Full reload so the proxy/RSC see the cookie freshly.
    window.location.assign(redirectTo);
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <ul className="grid grid-cols-3 gap-6">
        {PROFILES.map((p) => {
          const current = nickname === p.nickname;
          const loading = pendingNick === p.nickname;
          return (
            <li key={p.nickname}>
              <button
                type="button"
                onClick={() => pick(p)}
                disabled={pendingNick !== null}
                className={cn(
                  "group flex flex-col items-center gap-2 outline-none disabled:cursor-not-allowed",
                  loading && "animate-pulse",
                )}
              >
                <span
                  className={cn(
                    "flex size-20 items-center justify-center rounded-2xl border text-2xl font-medium transition-transform sm:size-24",
                    current
                      ? "border-foreground"
                      : "border-transparent group-hover:scale-105 group-hover:border-foreground/40 group-focus-visible:border-foreground",
                  )}
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                >
                  {p.nickname.slice(0, 1)}
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-wider",
                    current ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  @{p.nickname}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {nickname ? `현재: @${nickname} — 다른 프로필을 눌러 변경` : "프로필 선택"}
      </p>
    </div>
  );
}
