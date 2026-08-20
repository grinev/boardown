import { describe, expect, it } from 'vitest';
import { isSubmitShortcut, type SubmitShortcutEvent } from './submit-shortcut';

const event = (over: Partial<SubmitShortcutEvent>): SubmitShortcutEvent => ({
  key: 'Enter',
  metaKey: false,
  ctrlKey: false,
  defaultPrevented: false,
  ...over,
});

describe('isSubmitShortcut', () => {
  it('accepts Enter with either modifier', () => {
    expect(isSubmitShortcut(event({ metaKey: true }))).toBe(true);
    expect(isSubmitShortcut(event({ ctrlKey: true }))).toBe(true);
  });

  it('rejects Enter on its own', () => {
    expect(isSubmitShortcut(event({}))).toBe(false);
  });

  it('rejects another key held with the modifier', () => {
    expect(isSubmitShortcut(event({ key: 'a', ctrlKey: true }))).toBe(false);
    expect(isSubmitShortcut(event({ key: 'Escape', metaKey: true }))).toBe(false);
  });

  it('declines a keystroke an open popup already took', () => {
    expect(isSubmitShortcut(event({ metaKey: true, defaultPrevented: true }))).toBe(false);
  });
});
