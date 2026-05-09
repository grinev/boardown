import { describe, expect, it } from 'vitest';
import { parseConfig, serializeConfig } from './config.js';
import type { BoardConfig } from './schemas.js';

const VALID = `idPrefix: BD
nextId: 47
`;

describe('parseConfig', () => {
  it('parses a valid config', () => {
    const result = parseConfig(VALID);
    expect(result.problems).toEqual([]);
    expect(result.value).toEqual({
      idPrefix: 'BD',
      nextId: 47,
    });
  });

  it('parses a config with optional fields', () => {
    const text = `idPrefix: BD
nextId: 47
tasksDir: ../private-todos
theme: dark
`;
    const result = parseConfig(text);
    expect(result.problems).toEqual([]);
    expect(result.value).toEqual({
      idPrefix: 'BD',
      nextId: 47,
      tasksDir: '../private-todos',
      theme: 'dark',
    });
  });

  it('rejects unknown keys (strict mode)', () => {
    const text = `${VALID}extraKey: 'oops'\n`;
    const result = parseConfig(text);
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
  });

  it('rejects legacy statuses key', () => {
    const text = `${VALID}statuses: [todo, done]\n`;
    const result = parseConfig(text);
    expect(result.value).toBeNull();
  });

  it('rejects legacy paths key', () => {
    const text = `${VALID}paths:\n  releases: releases\n  epics: epics\n`;
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
      tasksDir: '.',
      theme: 'dark',
    };
    const out = serializeConfig(cfg);
    const idx = (s: string) => out.indexOf(s);
    expect(idx('idPrefix')).toBeLessThan(idx('nextId'));
    expect(idx('nextId')).toBeLessThan(idx('tasksDir'));
    expect(idx('tasksDir')).toBeLessThan(idx('theme'));
  });

  it('omits optional fields when undefined', () => {
    const cfg: BoardConfig = {
      idPrefix: 'BD',
      nextId: 0,
    };
    const out = serializeConfig(cfg);
    expect(out).not.toContain('theme');
    expect(out).not.toContain('tasksDir');
  });

  it('round-trips theme when set', () => {
    const cfg: BoardConfig = {
      idPrefix: 'BD',
      nextId: 0,
      theme: 'dark',
    };
    const out = serializeConfig(cfg);
    expect(out).toContain('theme: dark');
    const back = parseConfig(out);
    expect(back.problems).toEqual([]);
    expect(back.value).toEqual(cfg);
  });

  it('round-trips tasksDir when set', () => {
    const cfg: BoardConfig = {
      idPrefix: 'BD',
      nextId: 0,
      tasksDir: '../private-todos',
    };
    const out = serializeConfig(cfg);
    expect(out).toContain('tasksDir');
    const back = parseConfig(out);
    expect(back.problems).toEqual([]);
    expect(back.value).toEqual(cfg);
  });
});
