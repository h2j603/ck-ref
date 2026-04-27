import { cn } from "@/lib/utils";

// Tiny kiwi-fruit-shaped icon for the rating UI. Outer oval = skin, inner
// shape = flesh, center dot + radial seeds. At rating sizes (12-20px) only
// the outline + a few seed marks read; that's intentional.
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
        filled ? "text-lime-600" : "text-muted-foreground/50",
        className,
      )}
    >
      {/* skin */}
      <ellipse
        cx="12"
        cy="12"
        rx="9"
        ry="10.5"
        fill={filled ? "#84cc16" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
      />
      {/* flesh */}
      {filled ? (
        <ellipse
          cx="12"
          cy="12"
          rx="6"
          ry="7.5"
          fill="#ecfccb"
          stroke="none"
        />
      ) : null}
      {/* center pith + radial seeds */}
      <g
        stroke={filled ? "#3f6212" : "currentColor"}
        strokeWidth="1"
        strokeLinecap="round"
        fill={filled ? "#3f6212" : "none"}
      >
        <circle cx="12" cy="12" r="0.9" />
        <line x1="12" y1="6.5" x2="12" y2="8.2" />
        <line x1="12" y1="15.8" x2="12" y2="17.5" />
        <line x1="6.5" y1="12" x2="8.2" y2="12" />
        <line x1="15.8" y1="12" x2="17.5" y2="12" />
        <line x1="8.2" y1="8.2" x2="9.4" y2="9.4" />
        <line x1="14.6" y1="14.6" x2="15.8" y2="15.8" />
        <line x1="8.2" y1="15.8" x2="9.4" y2="14.6" />
        <line x1="14.6" y1="9.4" x2="15.8" y2="8.2" />
      </g>
    </svg>
  );
}
