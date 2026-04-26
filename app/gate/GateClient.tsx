"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNickname } from "@/lib/nickname";
import { type Profile } from "@/lib/profiles";
import { publicImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

import { EditProfileDialog } from "./EditProfileDialog";

export default function GateClient({
  initialAuthed,
  redirectTo,
  profiles,
}: {
  initialAuthed: boolean;
  redirectTo: string;
  profiles: Profile[];
}) {
  const [authed, setAuthed] = useState(initialAuthed);

  if (!authed) {
    return <PasswordForm onSuccess={() => setAuthed(true)} />;
  }
  return <ProfilePicker profiles={profiles} redirectTo={redirectTo} />;
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

function ProfilePicker({
  profiles,
  redirectTo,
}: {
  profiles: Profile[];
  redirectTo: string;
}) {
  const { nickname, setNickname } = useNickname();
  const [pendingNick, setPendingNick] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  function pick(profile: Profile) {
    setPendingNick(profile.key);
    setNickname(profile.key);
    window.location.assign(redirectTo);
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <ul className="grid grid-cols-3 gap-6">
        {profiles.map((p) => {
          const current = nickname === p.key;
          const loading = pendingNick === p.key;
          const avatar = p.avatar_path ? publicImageUrl(p.avatar_path) : null;
          return (
            <li key={p.key} className="relative">
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
                    "flex size-20 items-center justify-center overflow-hidden rounded-2xl border bg-cover bg-center text-2xl font-medium text-foreground transition-transform sm:size-24",
                    current
                      ? "border-foreground"
                      : "border-transparent group-hover:scale-105 group-hover:border-foreground/40 group-focus-visible:border-foreground",
                  )}
                  style={{
                    backgroundColor: avatar ? undefined : p.color,
                    backgroundImage: avatar ? `url(${avatar})` : undefined,
                  }}
                  aria-hidden
                >
                  {avatar ? "" : p.display_name.slice(0, 1)}
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-wider",
                    current
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  @{p.display_name}
                </span>
              </button>
              {current ? (
                <button
                  type="button"
                  onClick={() => setEditingProfile(p)}
                  className="absolute -right-1 -top-1 rounded-full border border-input bg-background p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="edit profile"
                >
                  <Pencil className="size-3" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {nickname
          ? "현재 프로필 위 연필 아이콘을 누르면 이름·사진을 바꿀 수 있어요"
          : "프로필 선택"}
      </p>
      {editingProfile ? (
        <EditProfileDialog
          profile={editingProfile}
          open={editingProfile !== null}
          onOpenChange={(open) => {
            if (!open) setEditingProfile(null);
          }}
        />
      ) : null}
    </div>
  );
}
