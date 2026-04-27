import { cn } from "@/lib/utils";

// Flat single-color kiwi-fruit silhouette: a slightly elongated body with a
// small leaf hint on top. Filled = solid currentColor; empty = outline.
export function KiwiIcon({
  filled = false,
  className,
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn(
        "shrink-0",
        filled ? "text-lime-500" : "text-muted-foreground/40",
        className,
      )}
    >
      <path
        d="M12 13 c0 -5 0 -8 4 -8 c-1 3 -2 5 -4 5"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse
        cx="12"
        cy="14"
        rx="7"
        ry="7.5"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
