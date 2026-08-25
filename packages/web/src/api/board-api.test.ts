import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveContained } from './board-api';

const ROOT = path.resolve('/tmp/board-root');

describe('resolveContained', () => {
  it('resolves a relative path against the root', () => {
    const result = resolveContained(ROOT, 'releases/v1.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.abs).toBe(path.join(ROOT, 'releases/v1.md'));
      expect(result.rel).toBe(path.join('releases', 'v1.md'));
    }
  });

  it('accepts backslashes as separators', () => {
    const result = resolveContained(ROOT, 'releases\\v1.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.abs).toBe(path.join(ROOT, 'releases/v1.md'));
    }
  });

  it('refuses a missing path', () => {
    expect(resolveContained(ROOT, null)).toMatchObject({ ok: false, status: 400 });
    expect(resolveContained(ROOT, '')).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses an absolute path', () => {
    expect(resolveContained(ROOT, '/etc/passwd')).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses a drive letter', () => {
    expect(resolveContained(ROOT, 'C:/Windows/system.ini')).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('refuses an escape above the root', () => {
    expect(resolveContained(ROOT, '../secrets.txt')).toMatchObject({ ok: false, status: 400 });
    expect(resolveContained(ROOT, 'releases/../../secrets.txt')).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('allows a traversal that stays inside the root', () => {
    expect(resolveContained(ROOT, 'releases/../config.yaml').ok).toBe(true);
  });
});
