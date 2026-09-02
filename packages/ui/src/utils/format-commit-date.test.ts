import { describe, expect, it } from 'vitest';
import { formatCommitDate } from './format-commit-date';

// Built from a local Date rather than a fixed offset: the output is the reader's
// own zone, so a hard-coded string would pass here and fail on a CI box.
const localIso = (...parts: [number, number, number, number, number]): string =>
  new Date(...parts).toISOString();

describe('formatCommitDate', () => {
  it('spells an instant as DD.MM.YYYY HH:MM', () => {
    expect(formatCommitDate(localIso(2026, 8, 2, 9, 11))).toBe('02.09.2026 09:11');
  });

  it('pads a single-digit day, month, hour and minute', () => {
    expect(formatCommitDate(localIso(2026, 0, 5, 7, 4))).toBe('05.01.2026 07:04');
  });

  it('keeps the same instant whatever offset it arrives in', () => {
    const noon = new Date(Date.UTC(2026, 2, 1, 12, 0));
    expect(formatCommitDate('2026-03-01T17:00:00+05:00')).toBe(
      formatCommitDate(noon.toISOString()),
    );
  });

  it('falls back to the raw value when no Date can read it', () => {
    expect(formatCommitDate('2026-09-02T09:11:49+518:00')).toBe(
      '2026-09-02T09:11:49+518:00',
    );
  });
});
