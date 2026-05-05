import { describe, expect, it } from 'vitest';
import { parseConfig, serializeConfig } from './config.js';
import type { BoardConfig } from './schemas.js';

const VALID = `idPrefix: BD
nextId: 47
statuses:
  - todo
  - in-progress
  - done
paths:
  releases: releases
  epics: epics
`;

describe('parseConfig', () => {
  it('parses a valid config', () => {
    const result = parseConfig(VALID);
    expect(result.problems).toEqual([]);
    expect(result.value).toEqual({
      idPrefix: 'BD',
      nextId: 47,
      statuses: ['todo', 'in-progress', 'done'],
      paths: { releases: 'releases', epics: 'epics' },
    });
  });

  it('rejects unknown keys (strict mode)', () => {
    const text = `${VALID}extraKey: 'oops'\n`;
    const result = parseConfig(text);
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
  });

  it('rejects unknown keys inside paths', () => {
    const text = `idPrefix: BD
nextId: 0
statuses: [todo]
paths:
  releases: releases
  epics: epics
  somethingElse: oops
`;
    const result = parseConfig(text);
    expect(result.value).toBeNull();
  });

  it('rejects invalid YAML', () => {
    const result = parseConfig(': : :');
    expect(result.value).toBeNull();
    expect(result.problems[0]!.message).toContain('Invalid config YAML');
  });

  it('rejects missing required fields', () => {
    const result = parseConfig('idPrefix: BD\n');
    expect(result.value).toBeNull();
  });
});

describe('serializeConfig', () => {
  it('round-trips parse → serialize → parse', () => {
    const cfg: BoardConfig = parseConfig(VALID).value!;
    const out = serializeConfig(cfg);
    const second = parseConfig(out);
    expect(second.problems).toEqual([]);
    expect(second.value).toEqual(cfg);
  });

  it('writes keys in canonical order', () => {
    const cfg: BoardConfig = {
      idPrefix: 'XX',
      nextId: 0,
      statuses: ['todo'],
      paths: { releases: 'r', epics: 'e' },
    };
    const out = serializeConfig(cfg);
    const idx = (s: string) => out.indexOf(s);
    expect(idx('idPrefix')).toBeLessThan(idx('nextId'));
    expect(idx('nextId')).toBeLessThan(idx('statuses'));
    expect(idx('statuses')).toBeLessThan(idx('paths'));
    expect(idx('releases')).toBeLessThan(idx('epics'));
  });
});
