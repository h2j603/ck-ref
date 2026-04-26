"use client";

import Link from "next/link";

import { useNickname } from "@/lib/nickname";
import { findProfile } from "@/lib/profiles";
import { cn } from "@/lib/utils";

export function HeaderProfile() {
  const { nickname, hydrated } = useNickname();
  if (!hydrated) {
    // Reserve space so the header doesn't reflow on hydration.
    return <span aria-hidden className="inline-block h-5 w-12" />;
  }
  const profile = nickname ? findProfile(nickname) : null;
  return (
    <Link
      href="/gate"
      className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      aria-label="profile"
    >
      <span
        aria-hidden
        className={cn(
          "size-4 rounded-full border border-black/10",
          !profile && "bg-muted",
        )}
        style={profile ? { backgroundColor: profile.color } : undefined}
      />
      {nickname ? `@${nickname}` : "Sign in"}
    </Link>
  );
}
