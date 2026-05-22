import { describe, expect, it } from 'vitest';
import { parseConfig, serializeConfig } from './config.js';
import type { BoardConfig } from './schemas.js';

const VALID = `idPrefix: BD
nextId: 47
projectName: My Project
`;

describe('parseConfig', () => {
  it('parses a valid config', () => {
    const result = parseConfig(VALID);
    expect(result.problems).toEqual([]);
    expect(result.value).toEqual({
      idPrefix: 'BD',
      nextId: 47,
      projectName: 'My Project',
    });
  });

  it('parses a config with optional fields', () => {
    const text = `idPrefix: BD
nextId: 47
projectName: My Project
theme: dark
`;
    const result = parseConfig(text);
    expect(result.problems).toEqual([]);
    expect(result.value).toEqual({
      idPrefix: 'BD',
      nextId: 47,
      projectName: 'My Project',
      theme: 'dark',
    });
  });

  it('rejects a missing projectName', () => {
    const text = `idPrefix: BD
nextId: 47
`;
    const result = parseConfig(text);
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
  });

  it('rejects empty projectName', () => {
    const text = `${VALID}`.replace('My Project', '""');
    const result = parseConfig(text);
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
  });

  it('rejects tasksDir because data location belongs to the shell', () => {
    const text = `${VALID}tasksDir: ../private-todos\n`;
    const result = parseConfig(text);
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
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
      projectName: 'My Project',
      theme: 'dark',
    };
    const out = serializeConfig(cfg);
    const idx = (s: string) => out.indexOf(s);
    expect(idx('idPrefix')).toBeLessThan(idx('nextId'));
    expect(idx('nextId')).toBeLessThan(idx('projectName'));
    expect(idx('projectName')).toBeLessThan(idx('theme'));
  });

  it('omits the optional theme when undefined', () => {
    const cfg: BoardConfig = {
      idPrefix: 'BD',
      nextId: 0,
      projectName: 'My Project',
    };
    const out = serializeConfig(cfg);
    expect(out).not.toContain('theme');
  });

  it('round-trips projectName', () => {
    const cfg: BoardConfig = {
      idPrefix: 'BD',
      nextId: 0,
      projectName: 'My Project',
    };
    const out = serializeConfig(cfg);
    expect(out).toContain('projectName');
    const back = parseConfig(out);
    expect(back.problems).toEqual([]);
    expect(back.value).toEqual(cfg);
  });

  it('round-trips theme when set', () => {
    const cfg: BoardConfig = {
      idPrefix: 'BD',
      nextId: 0,
      projectName: 'My Project',
      theme: 'dark',
    };
    const out = serializeConfig(cfg);
    expect(out).toContain('theme: dark');
    const back = parseConfig(out);
    expect(back.problems).toEqual([]);
    expect(back.value).toEqual(cfg);
  });
});
