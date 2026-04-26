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
}: {
  nickname: string | null | undefined;
  prefix?: "@" | "as @" | "";
  variant?: Variant;
  className?: string;
}) {
  if (!nickname) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider leading-none",
        VARIANTS[variant],
        className,
      )}
    >
      {prefix}
      {nickname}
    </span>
  );
}
