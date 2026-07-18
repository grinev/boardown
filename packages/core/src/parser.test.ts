import { describe, expect, it } from 'vitest';
import { parseBacklog, parseDocPage, parseEpic, parseRelease } from './parser.js';

const RELEASE_OK = `---
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
Should also support keyboard reordering for accessibility.

## Frontmatter parser

---
id: BD-2
type: tech
status: done
epic: parser
order: 200
---

Description in plain markdown. Supports **bold**, lists, \`code\`, etc.
`;

describe('parseRelease', () => {
  it('parses a well-formed file', () => {
    const result = parseRelease(RELEASE_OK, 'releases/1.10.md', '1.10');
    expect(result.problems).toEqual([]);
    expect(result.value).not.toBeNull();
    expect(result.value!.slug).toBe('1.10');
    expect(result.value!.frontmatter.status).toBe('current');
    expect(result.value!.preamble).toBe('# Release 1.10');
    expect(result.value!.tasks).toHaveLength(2);
    expect(result.value!.tasks[0]!.title).toBe('Implement card drag & drop');
    expect(result.value!.tasks[0]!.frontmatter).toEqual({
      id: 'BD-1',
      type: 'feature',
      status: 'in-progress',
      epic: 'ui-foundation',
      order: 100,
    });
    expect(result.value!.tasks[0]!.description).toContain('keyboard reordering');
    expect(result.value!.tasks[1]!.frontmatter.id).toBe('BD-2');
  });

  it('reports a file-level problem when the file frontmatter is missing', () => {
    const text = '## Some task\n\n---\nid: BD-1\ntype: feature\nstatus: todo\norder: 100\n---\n\nbody\n';
    const result = parseRelease(text, 'releases/x.md', 'x');
    expect(result.value).toBeNull();
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.scope).toBe('file');
  });

  it('skips a single broken task and keeps the rest', () => {
    const text = `---
release: "1.0"
status: future
---

## Good one

---
id: BD-1
type: feature
status: todo
order: 100
---

ok

## Bad one

---
type: feature
status: todo
order: 200
---

missing id
`;
    const result = parseRelease(text, 'releases/1.0.md', '1.0');
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
status: future
---

## Real task

---
id: BD-1
type: feature
status: todo
order: 100
---

Some description

## Not a task heading

more description here
`;
    const result = parseRelease(text, 'releases/1.0.md', '1.0');
    expect(result.value).not.toBeNull();
    expect(result.value!.tasks).toHaveLength(1);
    expect(result.value!.tasks[0]!.description).toContain('## Not a task heading');
    expect(result.value!.tasks[0]!.description).toContain('more description here');
  });
});

describe('parseBacklog', () => {
  it('parses a file with no frontmatter and multiple tasks', () => {
    const text = `## First

---
id: BD-12
type: tech
status: todo
order: 100
---

first body

## Second

---
id: BD-13
type: docs
status: todo
order: 200
---

second body
`;
    const result = parseBacklog(text, 'epics/no_epic.md');
    expect(result.problems).toEqual([]);
    expect(result.value).not.toBeNull();
    expect(result.value!.frontmatter).toEqual({});
    expect(result.value!.tasks).toHaveLength(2);
    expect(result.value!.tasks[0]!.frontmatter.id).toBe('BD-12');
  });

  it('parses a file with an empty frontmatter block', () => {
    const text = `---
---

## Only

---
id: BD-20
type: feature
status: todo
order: 100
---

body
`;
    const result = parseBacklog(text, 'epics/no_epic.md');
    expect(result.problems).toEqual([]);
    expect(result.value!.tasks).toHaveLength(1);
    expect(result.value!.tasks[0]!.frontmatter.id).toBe('BD-20');
  });

  it('skips a single broken task and keeps the rest', () => {
    const text = `## Good

---
id: BD-30
type: feature
status: todo
order: 100
---

ok

## Bad

---
type: feature
status: todo
order: 200
---

missing id
`;
    const result = parseBacklog(text, 'epics/no_epic.md');
    expect(result.value!.tasks).toHaveLength(1);
    expect(result.value!.tasks[0]!.frontmatter.id).toBe('BD-30');
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.scope).toBe('task');
  });

  it('handles a completely empty file', () => {
    const result = parseBacklog('', 'epics/no_epic.md');
    expect(result.problems).toEqual([]);
    expect(result.value!.tasks).toEqual([]);
    expect(result.value!.preamble).toBe('');
  });

  it('reports a problem when frontmatter has extra fields', () => {
    const text = `---
name: Should not be here
---

## A task

---
id: BD-40
type: tech
status: todo
order: 100
---

body
`;
    const result = parseBacklog(text, 'epics/no_epic.md');
    expect(result.value).not.toBeNull();
    expect(result.value!.tasks).toHaveLength(1);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.scope).toBe('file');
    expect(result.problems[0]!.message).toContain('Backlog frontmatter failed validation');
  });
});

describe('parseEpic', () => {
  it('parses an epic file', () => {
    const text = `---
name: UI Foundation
color: "#1f6feb"
---

Notes about the epic.

## Some epic task

---
id: BD-7
type: feature
status: todo
order: 100
---

body
`;
    const result = parseEpic(text, 'epics/ui-foundation.md', 'ui-foundation');
    expect(result.problems).toEqual([]);
    expect(result.value!.slug).toBe('ui-foundation');
    expect(result.value!.frontmatter.name).toBe('UI Foundation');
    expect(result.value!.frontmatter.color).toBe('#1f6feb');
    expect(result.value!.preamble).toBe('Notes about the epic.');
    expect(result.value!.tasks).toHaveLength(1);
  });

  it('infers task.epic from the file slug when the field is missing', () => {
    const text = `---
name: UI Foundation
color: "#1f6feb"
---

## Task with no epic field

---
id: BD-7
type: feature
status: todo
order: 100
---

body
`;
    const result = parseEpic(text, 'epics/ui-foundation.md', 'ui-foundation');
    expect(result.problems).toEqual([]);
    expect(result.value!.tasks[0]!.frontmatter.epic).toBe('ui-foundation');
  });

  it('overrides a stale task.epic value with the file slug', () => {
    const text = `---
name: UI Foundation
color: "#1f6feb"
---

## Task with stale epic

---
id: BD-7
type: feature
status: todo
epic: parser
order: 100
---

body
`;
    const result = parseEpic(text, 'epics/ui-foundation.md', 'ui-foundation');
    expect(result.problems).toEqual([]);
    expect(result.value!.tasks[0]!.frontmatter.epic).toBe('ui-foundation');
  });
});

describe('parseBacklog epic normalization', () => {
  it('drops task.epic for tasks in no_epic.md', () => {
    const text = `---
{}
---

## Stray epic field

---
id: BD-9
type: feature
status: todo
epic: ui-foundation
order: 100
---

body
`;
    const result = parseBacklog(text, 'epics/no_epic.md');
    expect(result.problems).toEqual([]);
    expect(result.value!.tasks).toHaveLength(1);
    expect(result.value!.tasks[0]!.frontmatter.epic).toBeUndefined();
  });
});

describe('parseDocPage', () => {
  it('reads a page with no frontmatter as a titleless page, not a problem', () => {
    const result = parseDocPage('# Hi\n\ntext', 'docs/a.md', 'a');
    expect(result.problems).toEqual([]);
    expect(result.value?.frontmatter.title).toBeUndefined();
    expect(result.value?.body).toBe('# Hi\n\ntext');
  });

  it('reports invalid frontmatter YAML as a file problem and keeps the file', () => {
    const result = parseDocPage('---\ntitle: [unclosed\n---\n\nbody', 'docs/a.md', 'a');
    expect(result.value).toBeNull();
    expect(result.problems[0]?.scope).toBe('file');
    expect(result.problems[0]?.file).toBe('docs/a.md');
  });

  it('reports a title of the wrong type as a validation problem', () => {
    const result = parseDocPage('---\ntitle: 42\n---\n\nbody', 'docs/a.md', 'a');
    expect(result.value).toBeNull();
    expect(result.problems[0]?.message).toContain('validation');
  });
});
