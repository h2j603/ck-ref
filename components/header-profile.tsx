"use client";

import Link from "next/link";

import { useNickname } from "@/lib/nickname";
import { findProfile, type Profile } from "@/lib/profiles";
import { publicImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function HeaderProfile({ profiles }: { profiles: Profile[] }) {
  const { nickname, hydrated } = useNickname();
  if (!hydrated) {
    return <span aria-hidden className="inline-block h-5 w-12" />;
  }
  const profile = findProfile(profiles, nickname);
  const avatar = profile?.avatar_path
    ? publicImageUrl(profile.avatar_path)
    : null;
  return (
    <Link
      href="/gate"
      className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      aria-label={profile ? `@${profile.display_name}` : "sign in"}
    >
      <span
        aria-hidden
        className={cn(
          "size-5 overflow-hidden rounded-full border border-black/10 bg-cover bg-center",
          !profile && "bg-muted",
        )}
        style={{
          backgroundColor: avatar ? undefined : profile?.color,
          backgroundImage: avatar ? `url(${avatar})` : undefined,
        }}
      />
      <span className="hidden sm:inline">
        {profile ? `@${profile.display_name}` : "Sign in"}
      </span>
    </Link>
  );
}
