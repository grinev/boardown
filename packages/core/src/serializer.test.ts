import { describe, expect, it } from 'vitest';
import { parseBacklog, parseEpic, parseRelease } from './parser.js';
import type { Epic } from './schemas.js';
import { serializeBacklog, serializeEpic, serializeRelease } from './serializer.js';

const RELEASE = `---
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
    const first = parseRelease(RELEASE, 'releases/1.10.md', '1.10');
    expect(first.problems).toEqual([]);
    const serialized = serializeRelease(first.value!);
    const second = parseRelease(serialized, 'releases/1.10.md', '1.10');
    expect(second.problems).toEqual([]);
    const reserialized = serializeRelease(second.value!);
    expect(reserialized).toBe(serialized);
  });

  it('preserves preamble across round-trip', () => {
    const first = parseRelease(RELEASE, 'releases/1.10.md', '1.10');
    const serialized = serializeRelease(first.value!);
    expect(serialized).toContain('# Release 1.10');
  });

  it('orders task frontmatter keys canonically', () => {
    const release = parseRelease(RELEASE, 'releases/1.10.md', '1.10').value!;
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

  it('orders release frontmatter keys canonically (status first, dates last)', () => {
    const release = parseRelease(RELEASE, 'releases/1.10.md', '1.10').value!;
    const out = serializeRelease(release);
    const fileFm = out.slice(0, out.indexOf('## '));
    const statusIdx = fileFm.indexOf('status: ');
    const startIdx = fileFm.indexOf('startDate: ');
    const endIdx = fileFm.indexOf('endDate: ');
    expect(statusIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeLessThan(startIdx);
    expect(startIdx).toBeLessThan(endIdx);
    expect(fileFm).not.toContain('release: ');
  });

  it('round-trips a release with description', () => {
    const text = `---
status: future
description: First public beta. Focuses on stability.
---
`;
    const first = parseRelease(text, 'releases/2.0.md', '2.0');
    expect(first.problems).toEqual([]);
    expect(first.value!.frontmatter.description).toBe(
      'First public beta. Focuses on stability.',
    );
    const serialized = serializeRelease(first.value!);
    const second = parseRelease(serialized, 'releases/2.0.md', '2.0');
    expect(second.problems).toEqual([]);
    expect(serializeRelease(second.value!)).toBe(serialized);
  });

  it('places description after name in serialized frontmatter', () => {
    const text = `---
status: future
name: Beta
description: Some text
startDate: 2026-06-01
---
`;
    const release = parseRelease(text, 'releases/2.0.md', '2.0').value!;
    const out = serializeRelease(release);
    const fileFm = out.slice(0, out.indexOf('---', 4) + 3);
    const nameIdx = fileFm.indexOf('name: ');
    const descIdx = fileFm.indexOf('description: ');
    const startIdx = fileFm.indexOf('startDate: ');
    expect(nameIdx).toBeGreaterThan(-1);
    expect(nameIdx).toBeLessThan(descIdx);
    expect(descIdx).toBeLessThan(startIdx);
  });

  it('ignores legacy release frontmatter field on parse', () => {
    const text = `---
release: "1.10"
status: current
---
`;
    const result = parseRelease(text, 'releases/1.10.md', '1.10');
    expect(result.problems).toEqual([]);
    expect(result.value!.slug).toBe('1.10');
    expect(serializeRelease(result.value!)).not.toContain('release: ');
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

  it('omits task.epic in serialized output even if the model carries it', () => {
    const text = `---
name: Parser
color: "#8957e5"
---

## Task

---
id: BD-9
type: feature
status: todo
order: 100
---
`;
    const first = parseEpic(text, 'epics/parser.md', 'parser');
    expect(first.value!.tasks[0]!.frontmatter.epic).toBe('parser');
    const serialized = serializeEpic(first.value!);
    expect(serialized).not.toMatch(/^epic:/m);
  });
});

describe('checklist serialization', () => {
  const withChecklist = `---
name: UI Foundation
color: "#1f6feb"
---

## A task

---
id: BD-9
type: feature
status: todo
order: 100
checklist:
  - id: c1
    text: Wire up the parser
    done: true
  - id: c2
    text: Add tests
    done: false
---

description
`;

  it('round-trips a task with a checklist', () => {
    const first = parseEpic(withChecklist, 'epics/ui-foundation.md', 'ui-foundation');
    expect(first.problems).toEqual([]);
    expect(first.value!.tasks[0]!.frontmatter.checklist).toEqual([
      { id: 'c1', text: 'Wire up the parser', done: true },
      { id: 'c2', text: 'Add tests', done: false },
    ]);
    const serialized = serializeEpic(first.value!);
    const second = parseEpic(serialized, 'epics/ui-foundation.md', 'ui-foundation');
    expect(second.problems).toEqual([]);
    expect(serializeEpic(second.value!)).toBe(serialized);
  });

  it('orders checklist after order and item keys canonically', () => {
    const release = parseEpic(withChecklist, 'epics/ui-foundation.md', 'ui-foundation')
      .value!;
    const out = serializeEpic(release);
    const orderIdx = out.indexOf('order: ');
    const checklistIdx = out.indexOf('checklist:');
    expect(orderIdx).toBeLessThan(checklistIdx);
    const firstItem = out.slice(out.indexOf('- id: c1'));
    expect(firstItem.indexOf('id: c1')).toBeLessThan(firstItem.indexOf('text: '));
    expect(firstItem.indexOf('text: ')).toBeLessThan(firstItem.indexOf('done: '));
  });

  it('omits an empty checklist from the serialized frontmatter', () => {
    const epic: Epic = {
      filename: 'epics/parser.md',
      slug: 'parser',
      frontmatter: { name: 'Parser', color: '#8957e5' },
      preamble: '',
      tasks: [
        {
          title: 'Task',
          description: '',
          frontmatter: { id: 'BD-1', type: 'feature', status: 'todo', order: 100, checklist: [] },
        },
      ],
    };
    expect(serializeEpic(epic)).not.toContain('checklist:');
  });
});

describe('notes serialization', () => {
  const withNotes = `---
name: UI Foundation
color: "#1f6feb"
---

## A task

---
id: BD-9
type: feature
status: todo
order: 100
notes:
  - id: n1
    text: First note
    createdAt: "2026-01-01T00:00:00.000Z"
  - id: n2
    text: Second note
    createdAt: "2026-01-02T12:30:00.000Z"
---

description
`;

  it('round-trips a task with notes', () => {
    const first = parseEpic(withNotes, 'epics/ui-foundation.md', 'ui-foundation');
    expect(first.problems).toEqual([]);
    expect(first.value!.tasks[0]!.frontmatter.notes).toEqual([
      { id: 'n1', text: 'First note', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'n2', text: 'Second note', createdAt: '2026-01-02T12:30:00.000Z' },
    ]);
    const serialized = serializeEpic(first.value!);
    const second = parseEpic(serialized, 'epics/ui-foundation.md', 'ui-foundation');
    expect(second.problems).toEqual([]);
    expect(serializeEpic(second.value!)).toBe(serialized);
  });

  it('orders notes after checklist with canonical item keys', () => {
    const withBoth = withNotes.replace(
      'notes:',
      `checklist:
  - id: c1
    text: Do it
    done: false
notes:`,
    );
    const epic = parseEpic(withBoth, 'epics/ui-foundation.md', 'ui-foundation').value!;
    const out = serializeEpic(epic);
    expect(out.indexOf('checklist:')).toBeLessThan(out.indexOf('notes:'));
    const firstNote = out.slice(out.indexOf('- id: n1'));
    expect(firstNote.indexOf('id: n1')).toBeLessThan(firstNote.indexOf('text: '));
    expect(firstNote.indexOf('text: ')).toBeLessThan(firstNote.indexOf('createdAt: '));
  });

  it('omits empty notes from the serialized frontmatter', () => {
    const epic: Epic = {
      filename: 'epics/parser.md',
      slug: 'parser',
      frontmatter: { name: 'Parser', color: '#8957e5' },
      preamble: '',
      tasks: [
        {
          title: 'Task',
          description: '',
          frontmatter: { id: 'BD-1', type: 'feature', status: 'todo', order: 100, notes: [] },
        },
      ],
    };
    expect(serializeEpic(epic)).not.toContain('notes:');
  });
});

describe('serializeBacklog', () => {
  it('omits task.epic field when serializing no_epic.md', () => {
    const text = `---
{}
---

## Backlog task

---
id: BD-1
type: feature
status: todo
order: 100
---
`;
    const first = parseBacklog(text, 'epics/no_epic.md');
    expect(first.value!.tasks[0]!.frontmatter.epic).toBeUndefined();
    const serialized = serializeBacklog(first.value!);
    expect(serialized).not.toMatch(/^epic:/m);
  });
});
