import { describe, expect, it } from 'vitest';
import { parseEpic, parseRelease } from './parser.js';

const RELEASE_OK = `---
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
Should also support keyboard reordering for accessibility.

## Frontmatter parser

---
id: BD-2
status: done
epic: parser
order: 200
---

Description in plain markdown. Supports **bold**, lists, \`code\`, etc.
`;

describe('parseRelease', () => {
  it('parses a well-formed file', () => {
    const result = parseRelease(RELEASE_OK, 'releases/1.10.md');
    expect(result.problems).toEqual([]);
    expect(result.value).not.toBeNull();
    expect(result.value!.frontmatter.release).toBe('1.10');
    expect(result.value!.preamble).toBe('# Release 1.10');
    expect(result.value!.tasks).toHaveLength(2);
    expect(result.value!.tasks[0]!.title).toBe('Implement card drag & drop');
    expect(result.value!.tasks[0]!.frontmatter).toEqual({
      id: 'BD-1',
      status: 'in-progress',
      epic: 'ui-foundation',
      order: 100,
    });
    expect(result.value!.tasks[0]!.description).toContain('keyboard reordering');
    expect(result.value!.tasks[1]!.frontmatter.id).toBe('BD-2');
  });

  it('reports a file-level problem when the file frontmatter is missing', () => {
    const text = '## Some task\n\n---\nid: BD-1\nstatus: todo\norder: 100\n---\n\nbody\n';
    const result = parseRelease(text, 'releases/x.md');
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.scope).toBe('file');
  });

  it('skips a single broken task and keeps the rest', () => {
    const text = `---
release: "1.0"
---

## Good one

---
id: BD-1
status: todo
order: 100
---

ok

## Bad one

---
status: todo
order: 200
---

missing id
`;
    const result = parseRelease(text, 'releases/1.0.md');
    expect(result.value).not.toBeNull();
    expect(result.value!.tasks).toHaveLength(1);
    expect(result.value!.tasks[0]!.frontmatter.id).toBe('BD-1');
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.scope).toBe('task');
    expect(result.problems[0]!.taskIndex).toBe(1);
  });

  it('keeps an H2 inside a description when no frontmatter follows it', () => {
    const text = `---
release: "1.0"
---

## Real task

---
id: BD-1
status: todo
order: 100
---

Some description

## Not a task heading

more description here
`;
    const result = parseRelease(text, 'releases/1.0.md');
    expect(result.value).not.toBeNull();
    expect(result.value!.tasks).toHaveLength(1);
    expect(result.value!.tasks[0]!.description).toContain('## Not a task heading');
    expect(result.value!.tasks[0]!.description).toContain('more description here');
  });
});

describe('parseEpic', () => {
  it('parses an epic file', () => {
    const text = `---
slug: ui-foundation
title: UI foundation
---

Notes about the epic.

## Some epic task

---
id: BD-7
status: todo
order: 100
---

body
`;
    const result = parseEpic(text, 'epics/ui-foundation.md');
    expect(result.problems).toEqual([]);
    expect(result.value!.frontmatter.slug).toBe('ui-foundation');
    expect(result.value!.preamble).toBe('Notes about the epic.');
    expect(result.value!.tasks).toHaveLength(1);
  });
});
