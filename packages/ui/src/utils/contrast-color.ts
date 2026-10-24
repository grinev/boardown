export function pickContrastText(
  hex: string,
): 'var(--epic-text-dark)' | 'var(--epic-text-light)' {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? 'var(--epic-text-dark)' : 'var(--epic-text-light)';
}
