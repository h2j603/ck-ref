"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNickname } from "@/lib/nickname";
import { type Profile } from "@/lib/profiles";
import { publicImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

import { EditProfileDialog } from "./EditProfileDialog";

export default function GateClient({
  redirectTo,
  profiles,
  counts,
}: {
  redirectTo: string;
  profiles: Profile[];
  counts: Record<string, number>;
}) {
  const { nickname, setNickname } = useNickname();
  const [signingIn, setSigningIn] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  return (
    <div className="flex flex-col items-center gap-8">
      <ul className="grid grid-cols-3 gap-6">
        {profiles.map((p) => {
          const current = nickname === p.key;
          const avatar = p.avatar_path ? publicImageUrl(p.avatar_path) : null;
          return (
            <li key={p.key} className="relative">
              <button
                type="button"
                onClick={() => setSigningIn(p)}
                className="group flex flex-col items-center gap-2 outline-none"
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
                <span className="font-mono text-[10px] tabular-nums tracking-wider text-muted-foreground">
                  {counts[p.key] ?? 0} ref
                  {counts[p.key] === 1 ? "" : "s"}
                </span>
                {!p.has_password ? (
                  <span className="rounded-full border border-dashed border-input px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    set password
                  </span>
                ) : null}
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
          ? "다른 프로필로 전환하려면 카드를 누르세요"
          : "프로필을 누르고 비밀번호를 입력하세요"}
      </p>

      {signingIn ? (
        <SignInDialog
          profile={signingIn}
          open={signingIn !== null}
          onOpenChange={(open) => {
            if (!open) setSigningIn(null);
          }}
          onSuccess={(key) => {
            setNickname(key);
            window.location.assign(redirectTo);
          }}
        />
      ) : null}

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

function SignInDialog({
  profile,
  open,
  onOpenChange,
  onSuccess,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (key: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstTime = !profile.has_password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }
    if (firstTime && password !== confirm) {
      setError("두 비밀번호가 일치하지 않아요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: profile.key, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "로그인에 실패했습니다.");
      }
      onSuccess(profile.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            @{profile.display_name} {firstTime ? "— 비밀번호 만들기" : "— 로그인"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {firstTime ? (
            <p className="text-xs text-muted-foreground">
              이 프로필은 아직 비밀번호가 없어요. 지금 입력한 값이 비밀번호로
              저장됩니다.
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signin-password">비밀번호</Label>
            <Input
              id="signin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={firstTime ? "new-password" : "current-password"}
              autoFocus
              required
            />
          </div>
          {firstTime ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signin-confirm">비밀번호 확인</Label>
              <Input
                id="signin-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              취소
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "확인 중…" : firstTime ? "저장하고 들어가기" : "들어가기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
