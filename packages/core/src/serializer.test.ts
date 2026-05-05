import { describe, expect, it } from 'vitest';
import { parseEpic, parseRelease } from './parser.js';
import { serializeEpic, serializeRelease } from './serializer.js';

const RELEASE = `---
release: "1.10"
startDate: 2026-05-01
endDate: 2026-05-15
---

# Release 1.10

## Implement card drag & drop

---
id: BD-1
status: in-progress
epic: ui-foundation
order: 100
---

Allow tasks to be dragged between status columns and between releases.

## Frontmatter parser

---
id: BD-2
status: done
epic: parser
order: 200
---

Description in plain markdown.
`;

describe('serializeRelease', () => {
  it('produces idempotent output after a parse → serialize → parse round-trip', () => {
    const first = parseRelease(RELEASE, 'releases/1.10.md');
    expect(first.problems).toEqual([]);
    const serialized = serializeRelease(first.value!);
    const second = parseRelease(serialized, 'releases/1.10.md');
    expect(second.problems).toEqual([]);
    const reserialized = serializeRelease(second.value!);
    expect(reserialized).toBe(serialized);
  });

  it('preserves preamble across round-trip', () => {
    const first = parseRelease(RELEASE, 'releases/1.10.md');
    const serialized = serializeRelease(first.value!);
    expect(serialized).toContain('# Release 1.10');
  });

  it('orders task frontmatter keys canonically', () => {
    const release = parseRelease(RELEASE, 'releases/1.10.md').value!;
    const out = serializeRelease(release);
    const idIdx = out.indexOf('id: ');
    const statusIdx = out.indexOf('status: ');
    const epicIdx = out.indexOf('epic: ');
    const orderIdx = out.indexOf('order: ');
    expect(idIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeLessThan(statusIdx);
    expect(statusIdx).toBeLessThan(epicIdx);
    expect(epicIdx).toBeLessThan(orderIdx);
  });
});

describe('serializeEpic', () => {
  it('round-trips an epic', () => {
    const text = `---
slug: ui-foundation
title: UI foundation
---

Some notes.

## A task

---
id: BD-9
status: todo
order: 100
---

description
`;
    const first = parseEpic(text, 'epics/ui-foundation.md');
    const serialized = serializeEpic(first.value!);
    const second = parseEpic(serialized, 'epics/ui-foundation.md');
    expect(second.problems).toEqual([]);
    expect(serializeEpic(second.value!)).toBe(serialized);
  });
});
