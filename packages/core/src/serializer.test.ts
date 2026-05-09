import { describe, expect, it } from 'vitest';
import { parseEpic, parseRelease } from './parser.js';
import { serializeEpic, serializeRelease } from './serializer.js';

const RELEASE = `---
release: "1.10"
status: current
startDate: 2026-05-01
endDate: 2026-05-15
---

# Release 1.10

## Implement card drag & drop

---
id: BD-1
type: feature
status: in-progress
epic: ui-foundation
order: 100
---

Allow tasks to be dragged between status columns and between releases.

## Frontmatter parser

---
id: BD-2
type: tech
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
    const firstTask = out.slice(out.indexOf('## '));
    const idIdx = firstTask.indexOf('id: ');
    const typeIdx = firstTask.indexOf('type: ');
    const statusIdx = firstTask.indexOf('status: ');
    const epicIdx = firstTask.indexOf('epic: ');
    const orderIdx = firstTask.indexOf('order: ');
    expect(idIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeLessThan(typeIdx);
    expect(typeIdx).toBeLessThan(statusIdx);
    expect(statusIdx).toBeLessThan(epicIdx);
    expect(epicIdx).toBeLessThan(orderIdx);
  });

  it('orders release frontmatter keys canonically', () => {
    const release = parseRelease(RELEASE, 'releases/1.10.md').value!;
    const out = serializeRelease(release);
    const fileFm = out.slice(0, out.indexOf('## '));
    const releaseIdx = fileFm.indexOf('release: ');
    const statusIdx = fileFm.indexOf('status: ');
    const startIdx = fileFm.indexOf('startDate: ');
    const endIdx = fileFm.indexOf('endDate: ');
    expect(releaseIdx).toBeLessThan(statusIdx);
    expect(statusIdx).toBeLessThan(startIdx);
    expect(startIdx).toBeLessThan(endIdx);
  });
});

describe('serializeEpic', () => {
  it('round-trips an epic', () => {
    const text = `---
name: UI Foundation
color: "#1f6feb"
---

Some notes.

## A task

---
id: BD-9
type: feature
status: todo
order: 100
---

description
`;
    const first = parseEpic(text, 'epics/ui-foundation.md', 'ui-foundation');
    const serialized = serializeEpic(first.value!);
    const second = parseEpic(serialized, 'epics/ui-foundation.md', 'ui-foundation');
    expect(second.problems).toEqual([]);
    expect(serializeEpic(second.value!)).toBe(serialized);
  });

  it('never writes slug into the frontmatter', () => {
    const text = `---
name: Parser
color: "#8957e5"
---
`;
    const first = parseEpic(text, 'epics/parser.md', 'parser');
    const serialized = serializeEpic(first.value!);
    expect(serialized).not.toContain('slug:');
  });

  it('orders epic frontmatter keys canonically', () => {
    const text = `---
color: "#8957e5"
name: Parser
---
`;
    const first = parseEpic(text, 'epics/parser.md', 'parser');
    const out = serializeEpic(first.value!);
    const nameIdx = out.indexOf('name: ');
    const colorIdx = out.indexOf('color: ');
    expect(nameIdx).toBeLessThan(colorIdx);
  });
});
