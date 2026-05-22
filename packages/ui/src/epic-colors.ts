import type { Epic } from '@boardown/core';

// Fixed palette offered when creating an epic. 24 distinct hues; values are
// stored verbatim into the epic frontmatter `color`.
export const EPIC_COLORS: readonly string[] = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#1f6feb', // boardown blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#78716c', // stone
  '#6b7280', // gray
  '#475569', // slate
  '#b45309', // brown
  '#0f766e', // deep teal
  '#9333ea', // deep purple
];

export const pickDefaultEpicColor = (existing: readonly Epic[]): string => {
  const used = new Set(existing.map((e) => e.frontmatter.color.toLowerCase()));
  const free = EPIC_COLORS.find((c) => !used.has(c.toLowerCase()));
  return free ?? EPIC_COLORS[0]!;
};
