"use client";

import Image from "next/image";
import { useRef, useState } from "react";

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
import { type Profile } from "@/lib/profiles";
import { publicImageUrl } from "@/lib/storage";
import { STORAGE_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

function fileExt(file: File) {
  const dot = file.name.lastIndexOf(".");
  if (dot >= 0) return file.name.slice(dot + 1).toLowerCase();
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "bin";
}

export function EditProfileDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: Profile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentAvatar = profile.avatar_path
    ? publicImageUrl(profile.avatar_path)
    : null;

  function pickFile(f: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function handleSave() {
    setError(null);
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError("이름을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      let avatarPath = profile.avatar_path;
      if (file) {
        const path = `avatars/${profile.key}-${Date.now()}.${fileExt(file)}`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, {
            cacheControl: "31536000",
            upsert: false,
            contentType: file.type || undefined,
          });
        if (upErr) throw upErr;
        avatarPath = path;
      }
      const { error: updErr } = await supabase
        .from("profiles")
        .update({
          display_name: trimmed,
          avatar_path: avatarPath,
          updated_at: new Date().toISOString(),
        })
        .eq("key", profile.key);
      if (updErr) throw updErr;
      window.location.reload();
    } catch (err) {
      console.error("profile update failed", err);
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>프로필 설정 — {profile.key}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="relative flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-input text-2xl font-medium text-foreground"
              style={{
                backgroundColor:
                  previewUrl || currentAvatar ? undefined : profile.color,
              }}
              aria-label="change avatar"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="preview"
                  className="size-full object-cover"
                />
              ) : currentAvatar ? (
                <Image
                  src={currentAvatar}
                  alt="avatar"
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <span aria-hidden>{profile.display_name.slice(0, 1)}</span>
              )}
            </button>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                {file ? "다른 사진 선택" : "사진 변경"}
              </Button>
              {file ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => pickFile(null)}
                >
                  되돌리기
                </Button>
              ) : null}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display_name">표시 이름</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={24}
            />
            <p className="font-mono text-[10px] text-muted-foreground">
              내부 식별자(@{profile.key})는 그대로 유지돼요.
            </p>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            취소
          </Button>
          <Button type="button" onClick={handleSave} disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
