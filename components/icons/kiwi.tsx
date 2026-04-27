import { cn } from "@/lib/utils";

// Flat single-color kiwi bird silhouette: plump round body, long thin beak,
// two skinny legs. One currentColor; filled = solid body + beak, empty =
// outline only. Legs are stroked either way so they read at small sizes.
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
      aria-hidden
      className={cn(
        "shrink-0",
        filled ? "text-lime-500" : "text-muted-foreground/40",
        className,
      )}
    >
      {/* body */}
      <ellipse
        cx="10"
        cy="12"
        rx="7"
        ry="6"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {/* beak — slim triangle off the front */}
      <path
        d="M16 11 L22.5 12.5 L16 13.2 Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* legs */}
      <path
        d="M8.5 18 L8.5 21 M12.5 18 L12.5 21"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
