import Link from "next/link";

import { cn } from "@/lib/utils";

type Variant = "solid" | "outline" | "ghost";

const VARIANTS: Record<Variant, string> = {
  solid: "border border-foreground bg-foreground text-background",
  outline: "border border-input text-foreground",
  ghost: "border border-transparent text-muted-foreground",
};

export function NicknamePill({
  nickname,
  prefix = "@",
  variant = "outline",
  className,
  link = true,
}: {
  nickname: string | null | undefined;
  prefix?: "@" | "as @" | "";
  variant?: Variant;
  className?: string;
  link?: boolean;
}) {
  if (!nickname) return null;
  const classes = cn(
    "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider leading-none transition-colors",
    VARIANTS[variant],
    link && "hover:border-foreground hover:text-foreground",
    className,
  );
  const body = (
    <>
      {prefix}
      {nickname}
    </>
  );
  if (link) {
    return (
      <Link href={`/u/${encodeURIComponent(nickname)}`} className={classes}>
        {body}
      </Link>
    );
  }
  return <span className={classes}>{body}</span>;
}
