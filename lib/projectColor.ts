// Deterministic color per WIP project. Using a hash of the project's UUID
// instead of storing a `color` column means the same project always renders
// the same color across the app, no migrations on schema, and renaming a
// project doesn't shift it. The color is HSL with a fixed saturation and
// lightness so contrast against light/dark backgrounds is consistent.

export function projectColor(projectId: string | null | undefined): string {
  if (!projectId) return "hsl(220 8% 60%)"; // neutral grey for unassigned events
  let h = 0;
  for (let i = 0; i < projectId.length; i++) {
    h = (h * 31 + projectId.charCodeAt(i)) | 0;
  }
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue} 65% 55%)`;
}

// Slightly muted variant for backgrounds where the saturated color would
// be too loud — used for filled day-cell highlights and chips.
export function projectColorSoft(projectId: string | null | undefined): string {
  if (!projectId) return "hsl(220 8% 90%)";
  let h = 0;
  for (let i = 0; i < projectId.length; i++) {
    h = (h * 31 + projectId.charCodeAt(i)) | 0;
  }
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue} 60% 92%)`;
}
