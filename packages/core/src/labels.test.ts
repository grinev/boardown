import { describe, expect, it } from 'vitest';
import { BoardOpError, createTask, createTaskWithLinks, emptyBacklog, setTaskLabels } from './board-ops.js';
import { parseConfig, serializeConfig } from './config.js';
import {
  LABEL_MAX_LENGTH,
  addLabels,
  removeLabels,
  resolveLabel,
  validateLabel,
  withLabelsInRegistry,
} from './labels.js';
import { parseBacklog } from './parser.js';
import type { Backlog, BoardConfig, Release, Task } from './schemas.js';
import { serializeBacklog } from './serializer.js';

const config: BoardConfig = {
  idPrefix: 'BD',
  nextId: 10,
  projectName: 'My Project',
  labels: ['backend', 'ui'],
};

const task = (id: string, labels?: string[]): Task => ({
  title: id,
  description: '',
  frontmatter: { id, type: 'feature', status: 'todo', order: 100, ...(labels ? { labels } : {}) },
});

const backlog = (...tasks: Task[]): Backlog => ({ ...emptyBacklog(), tasks });

const finished = (...tasks: Task[]): Release => ({
  filename: 'releases/v1.md',
  slug: 'v1',
  frontmatter: { status: 'finished' },
  preamble: '',
  tasks,
});

describe('label rules', () => {
  it('refuses an empty label, whitespace and anything over the limit', () => {
    expect(validateLabel('backend')).toBeNull();
    expect(validateLabel('важно')).toBeNull();
    expect(validateLabel('x'.repeat(LABEL_MAX_LENGTH))).toBeNull();
    expect(validateLabel('')).toMatch(/empty/);
    expect(validateLabel('two words')).toMatch(/whitespace/);
    expect(validateLabel('tab\there')).toMatch(/whitespace/);
    expect(validateLabel('x'.repeat(LABEL_MAX_LENGTH + 1))).toMatch(/at most 28/);
  });

  it('resolves to the registry spelling, ignoring case', () => {
    expect(resolveLabel(['Backend'], 'BACKEND')).toBe('Backend');
    expect(resolveLabel(['Backend'], 'new')).toBe('new');
    expect(resolveLabel(undefined, 'new')).toBe('new');
  });

  it('adds each label once, keeps carried spellings, and removes ignoring case', () => {
    expect(addLabels(['Backend'], ['backend', 'UI', 'x', 'X'], ['ui'])).toEqual(['Backend', 'ui', 'x']);
    expect(removeLabels(['Backend', 'ui'], ['BACKEND'])).toEqual(['ui']);
  });

  it('appends only the missing labels to the registry, in order', () => {
    expect(withLabelsInRegistry(config, ['UI', 'new', 'New', 'other']).labels).toEqual([
      'backend',
      'ui',
      'new',
      'other',
    ]);
    expect(withLabelsInRegistry(config, ['ui'])).toBe(config);
    const bare: BoardConfig = { idPrefix: 'BD', nextId: 1, projectName: 'P' };
    expect(withLabelsInRegistry(bare, []).labels).toBeUndefined();
    expect(withLabelsInRegistry(bare, ['a']).labels).toEqual(['a']);
  });
});

describe('config labels registry', () => {
  const base = 'idPrefix: BD\nnextId: 1\nprojectName: P\n';

  it('parses and serializes the registry after customFields', () => {
    const text = `${base}customFields:\n  - key: env\n    type: string\nlabels:\n  - backend\n  - важно\n`;
    const result = parseConfig(text);
    expect(result.problems).toEqual([]);
    expect(result.value?.labels).toEqual(['backend', 'важно']);
    const out = serializeConfig(result.value!);
    expect(out.indexOf('labels:')).toBeGreaterThan(out.indexOf('customFields:'));
    expect(parseConfig(out).value?.labels).toEqual(['backend', 'важно']);
  });

  it.each([
    ['whitespace', '  - "two words"\n'],
    ['over the limit', `  - ${'x'.repeat(LABEL_MAX_LENGTH + 1)}\n`],
    ['a duplicate ignoring case', '  - ui\n  - UI\n'],
    ['an empty entry', '  - ""\n'],
    ['a non-string', '  - 12\n'],
  ])('makes the config invalid on %s', (_name, entries) => {
    const result = parseConfig(`${base}labels:\n${entries}`);
    expect(result.value).toBeNull();
    expect(result.problems[0]?.level).toBe('error');
  });

  it('reserves labels as a custom field key', () => {
    const result = parseConfig(`${base}customFields:\n  - key: labels\n    type: string\n`);
    expect(result.value).toBeNull();
    expect(result.problems[0]?.message).toMatch(/labels/);
  });
});

describe('task labels on disk', () => {
  const file = (labelsYaml: string) => `## First

---
id: BD-1
type: feature
status: todo
order: 100
${labelsYaml}---

## Second

---
id: BD-2
type: feature
status: todo
order: 200
---
`;

  it('loads a hand-edited label as it is, rule or no rule', () => {
    const result = parseBacklog(file('labels:\n  - "two words"\n  - backend\n'), 'backlog.md');
    expect(result.problems).toEqual([]);
    expect(result.value!.tasks[0]!.frontmatter.labels).toEqual(['two words', 'backend']);
  });

  it.each([
    ['a scalar', 'labels: backend\n'],
    ['a number', 'labels:\n  - 2024\n'],
    ['a map', 'labels:\n  - a: b\n'],
    ['null', 'labels:\n'],
  ])('makes %s an error on that task while the task loads', (_name, labelsYaml) => {
    const result = parseBacklog(file(labelsYaml), 'backlog.md');
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ level: 'error', scope: 'task', taskId: 'BD-1' });
    expect(result.value!.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1', 'BD-2']);
    expect(result.value!.tasks[0]!.frontmatter.labels).toBeUndefined();
  });

  it('writes labels after links and before custom values, only when present', () => {
    const t = task('BD-1', ['#tag', 'a:b', '-x', 'yes', '2024', 'важно']);
    t.frontmatter.links = [{ type: 'relates', to: 'BD-2' }];
    t.frontmatter.custom = { env: 'prod' };
    const text = serializeBacklog(backlog(t, task('BD-2')));
    const block = text.slice(0, text.indexOf('## BD-2'));
    expect(block.indexOf('links:')).toBeLessThan(block.indexOf('labels:'));
    expect(block.indexOf('labels:')).toBeLessThan(block.indexOf('env:'));
    expect(text.slice(text.indexOf('## BD-2'))).not.toContain('labels');
    const reparsed = parseBacklog(text, 'backlog.md', [{ key: 'env', type: 'string' }]);
    expect(reparsed.problems).toEqual([]);
    expect(reparsed.value!.tasks[0]!.frontmatter.labels).toEqual(t.frontmatter.labels);
  });
});

describe('setTaskLabels', () => {
  it('stores the list, resolves added labels and appends new ones to the registry', () => {
    const before = backlog(task('BD-1', ['backend']), task('BD-2'));
    const result = setTaskLabels(before, config, 'BD-1', ['backend', 'UI', 'new']);
    expect(result.container.tasks[0]!.frontmatter.labels).toEqual(['backend', 'ui', 'new']);
    expect(result.config.labels).toEqual(['backend', 'ui', 'new']);
    expect(result.container.tasks.map((t) => t.frontmatter.id)).toEqual(['BD-1', 'BD-2']);
  });

  it('keeps a carried label out of the rule and out of the registry', () => {
    const before = backlog(task('BD-1', ['two words', 'Legacy']));
    const result = setTaskLabels(before, config, 'BD-1', ['two words', 'legacy', 'ui']);
    expect(result.container.tasks[0]!.frontmatter.labels).toEqual(['two words', 'Legacy', 'ui']);
    expect(result.config).toBe(config);
  });

  it('refuses an added label that breaks the rule', () => {
    expect(() => setTaskLabels(backlog(task('BD-1')), config, 'BD-1', ['two words'])).toThrow(
      /whitespace/,
    );
  });

  it('drops the key when the list empties, and leaves the registry alone', () => {
    const result = setTaskLabels(backlog(task('BD-1', ['ui'])), config, 'BD-1', []);
    expect(result.container.tasks[0]!.frontmatter.labels).toBeUndefined();
    expect(result.config.labels).toEqual(['backend', 'ui']);
  });

  it('refuses a task in a finished release', () => {
    expect(() => setTaskLabels(finished(task('BD-1')), config, 'BD-1', ['ui'])).toThrow(
      BoardOpError,
    );
  });
});

describe('createTask with labels', () => {
  it('stores resolved labels once and appends new ones to the registry', () => {
    const result = createTask(backlog(), config, {
      title: 'New',
      type: 'feature',
      status: 'todo',
      labels: ['UI', 'fresh', 'ui'],
    });
    expect(result.task.frontmatter.labels).toEqual(['ui', 'fresh']);
    expect(result.config.labels).toEqual(['backend', 'ui', 'fresh']);
    expect(result.config.nextId).toBe(11);
  });

  it('writes no key without labels, and passes through createTaskWithLinks', () => {
    const plain = createTask(backlog(), config, { title: 'New', type: 'feature', status: 'todo' });
    expect(plain.task.frontmatter.labels).toBeUndefined();
    const linked = createTaskWithLinks([backlog(task('BD-1'))], 'backlog.md', config, {
      title: 'New',
      type: 'feature',
      status: 'todo',
      labels: ['x'],
    }, []);
    expect(linked.task.frontmatter.labels).toEqual(['x']);
    expect(linked.config.labels).toEqual(['backend', 'ui', 'x']);
  });

  it('refuses a label that breaks the rule', () => {
    expect(() =>
      createTask(backlog(), config, { title: 'N', type: 'feature', status: 'todo', labels: [''] }),
    ).toThrow(/empty/);
  });
});
