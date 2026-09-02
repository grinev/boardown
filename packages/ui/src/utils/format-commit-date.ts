const pad = (value: number): string => String(value).padStart(2, '0');

// The ISO date `core` carries, spelled DD.MM.YYYY HH:MM in the reader's own time
// zone: the machine-readable value stays in the model, the spelling is the
// surface's. A value no `Date` can read falls back to its own text, as the notes
// list does, rather than printing NaN.
export const formatCommitDate = (iso: string): string => {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${String(at.getFullYear())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
};
