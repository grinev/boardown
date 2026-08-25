import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import {
  REGISTRY_ID_PATTERN,
  parseRegistry,
  sameEntries,
  type RegistryEntry,
} from './registry.js';
import { rootsFromProjectFolder } from './roots.js';

// The registry file is patched as text, never re-serialized from what it parsed
// to: it is the user's file, it may hold comments and an order chosen by hand,
// and a status change that shows up as a one-line diff is the same promise the
// board files make. Everything here is strings in, strings out — the filesystem
// belongs to RegistryFile, and the only thing that touches it is the folder check
// a refusal is built on.
//
// Whatever the patcher does is checked before it lands: `verify` re-parses the
// text it produced and compares the entries against the ones the edit meant to
// leave behind. A shape of file it reads wrongly becomes a refusal rather than a
// corrupted registry, which is what lets it stay this simple.

/** The field a refusal belongs to, so the page can put it under that input. */
export type RefusalField = 'path' | 'id' | null;

export interface Refusal {
  field: RefusalField;
  message: string;
}

export type EditResult = { ok: true; text: string } | ({ ok: false } & Refusal);

// The value is matched with `[^\n]` rather than `.`, which does not match the
// '\r' every line of a CRLF file still ends with after the split.
const KEY = /^(\s*)(?:projects|'projects'|"projects")\s*:([^\n]*)$/;

interface Block {
  /** Index of the `projects:` line. */
  keyLine: number;
  /** Indentation of the `projects:` line. */
  keyIndent: string;
  /** Everything after the colon on the key line. */
  value: string;
  /** Indices of the lines holding entries, in file order. */
  entryLines: number[];
  /** The indentation those entries are written at. */
  entryIndent: string;
}

const indentOf = (line: string): string => (/^\s*/.exec(line)?.[0] ?? '');

const isBlank = (line: string): boolean => line.trim() === '';

const isComment = (line: string): boolean => line.trim().startsWith('#');

/** Reads one entry line on its own. A key may be quoted, so the parser answers
 *  what the key is rather than the text being matched against the id. */
const keyOf = (line: string): string | null => {
  let parsed: unknown;
  try {
    parsed = yaml.load(line.trim());
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed);
  return keys.length === 1 ? (keys[0] ?? null) : null;
};

const findBlock = (lines: readonly string[]): Block | null => {
  const keyLine = lines.findIndex((line) => KEY.test(line));
  if (keyLine === -1) return null;
  const match = KEY.exec(lines[keyLine] ?? '');
  if (match === null) return null;
  const keyIndent = match[1] ?? '';
  const entryLines: number[] = [];
  for (let i = keyLine + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isBlank(line)) continue;
    // A line no deeper than the key ends the block, comment or not: a comment at
    // the key's own indentation reads as introducing whatever comes next.
    if (indentOf(line).length <= keyIndent.length) break;
    if (!isComment(line)) entryLines.push(i);
  }
  const first = entryLines[0];
  return {
    keyLine,
    keyIndent,
    value: (match[2] ?? '').replace(/\r$/, ''),
    entryLines,
    entryIndent: first === undefined ? `${keyIndent}  ` : indentOf(lines[first] ?? ''),
  };
};

/** `projects: {}` — an empty flow mapping, with a trailing comment allowed. It is
 *  how a registry with nothing in it has to be written, since a bare key parses
 *  as null and the schema refuses that. */
const EMPTY_FLOW = /^\s*\{\s*\}\s*(#.*)?$/;

// Splitting on '\n' alone leaves the '\r' of a CRLF file on the end of each line,
// so every line the patch does not touch stays byte for byte what it was. A line
// this module writes has to carry that '\r' itself.
const linesOf = (text: string): string[] => text.split('\n');

const crOf = (text: string): string => (text.includes('\r\n') ? '\r' : '');

const joinLines = (lines: readonly string[]): string => lines.join('\n');

/**
 * A file that does not end in a newline has no line ending on its last line, so
 * a patch that changed which line is last has to carry the '\r' across: the line
 * that became last loses it, and the one that stopped being last gains it.
 * A file that does end in a newline has an empty last element and needs none of
 * this.
 */
const settleEnd = (lines: string[], text: string): void => {
  if (text.endsWith('\n')) return;
  const last = lines.length - 1;
  const line = lines[last];
  if (line === undefined) return;
  lines[last] = line.replace(/\r$/, '');
  const previous = lines[last - 1];
  if (crOf(text) === '\r' && previous !== undefined && !previous.endsWith('\r')) {
    lines[last - 1] = `${previous}\r`;
  }
};

/** One `id: path` line, quoted by the same writer the board files use — that is
 *  what puts quotes around a path carrying YAML metacharacters and leaves an
 *  ordinary Windows path plain. */
const entryLine = (id: string, folder: string): string =>
  yaml
    .dump({ [id]: folder }, { lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"' })
    .replace(/\n+$/, '');

const refuse = (message: string, field: RefusalField = null): EditResult => ({
  ok: false,
  field,
  message,
});

const UNPATCHABLE =
  'The registry file is not in a shape this page can edit — edit it by hand instead.';

/** The patch is only allowed to land if the file it produced holds exactly the
 *  entries the edit meant to leave behind. */
const verify = (text: string, expected: readonly RegistryEntry[]): EditResult => {
  const parsed = parseRegistry(text);
  if (!parsed.ok || !sameEntries(parsed.entries, expected)) return refuse(UNPATCHABLE);
  return { ok: true, text };
};

/**
 * Appends one entry. `text` is null when the file does not exist yet, and then
 * the whole file is the entry — the smallest registry that holds it.
 */
export const addEntry = (
  text: string | null,
  current: readonly RegistryEntry[],
  id: string,
  folder: string,
): EditResult => {
  const expected = [...current, { id, ...rootsFromProjectFolder(folder) }];
  if (text === null) {
    return verify(`projects:\n  ${entryLine(id, folder)}\n`, expected);
  }
  const lines = linesOf(text);
  const block = findBlock(lines);
  if (block === null) return refuse(UNPATCHABLE);
  const cr = crOf(text);
  const added = `${block.entryIndent}${entryLine(id, folder)}${cr}`;
  const last = block.entryLines[block.entryLines.length - 1];
  if (last === undefined) {
    // No entries yet, so the key still carries a `{}` that has to give way to a
    // block before a line can be inserted under it. Any trailing comment on that
    // line is the user's and stays.
    const empty = EMPTY_FLOW.exec(block.value);
    if (block.value.trim() !== '' && empty === null) return refuse(UNPATCHABLE);
    const comment = empty?.[1];
    lines[block.keyLine] =
      `${block.keyIndent}projects:${comment === undefined ? '' : ` ${comment}`}${cr}`;
    lines.splice(block.keyLine + 1, 0, added);
  } else {
    lines.splice(last + 1, 0, added);
  }
  settleEnd(lines, text);
  return verify(joinLines(lines), expected);
};

/**
 * Drops one entry. Emptying the block turns the key back into `{}`, because a
 * bare `projects:` parses as null and would leave the file unreadable — a Remove
 * that breaks the file it edits is not a Remove.
 */
export const removeEntry = (
  text: string,
  current: readonly RegistryEntry[],
  id: string,
): EditResult => {
  const expected = current.filter((entry) => entry.id !== id);
  const lines = linesOf(text);
  const block = findBlock(lines);
  if (block === null) return refuse(UNPATCHABLE);
  const target = block.entryLines.find((i) => keyOf(lines[i] ?? '') === id);
  if (target === undefined) return refuse(UNPATCHABLE);
  lines.splice(target, 1);
  if (block.entryLines.length === 1) {
    const trailing = block.value.trim();
    lines[block.keyLine] =
      `${block.keyIndent}projects: {}${trailing === '' ? '' : ` ${trailing}`}${crOf(text)}`;
  }
  settleEnd(lines, text);
  return verify(joinLines(lines), expected);
};

const sameFolder = (a: string, b: string): boolean =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/**
 * What the page is allowed to add. The folder must be one that exists now — a
 * typo caught while typing is correctable, unlike an entry whose folder goes
 * missing later, which keeps its row. Only the first refusal is reported, and
 * the path is checked before the id, the order the two fields are read in.
 */
export const validateAdd = async (
  current: readonly RegistryEntry[],
  rawPath: string,
  rawId: string,
): Promise<{ ok: true; id: string; folder: string } | ({ ok: false } & Refusal)> => {
  const typed = rawPath.trim();
  const id = rawId.trim();
  if (typed === '') return { ok: false, field: 'path', message: 'Enter a path.' };
  if (!path.isAbsolute(typed)) {
    return { ok: false, field: 'path', message: 'The path must be absolute.' };
  }
  const folder = path.resolve(typed);
  try {
    if (!(await fs.stat(folder)).isDirectory()) {
      return { ok: false, field: 'path', message: 'That path is not a folder.' };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ok: false,
      field: 'path',
      message:
        code === 'ENOENT' || code === 'ENOTDIR'
          ? 'There is no folder at that path.'
          : 'That folder could not be read.',
    };
  }
  const taken = current.find((entry) => sameFolder(entry.projectRoot, folder));
  if (taken !== undefined) {
    return { ok: false, field: 'path', message: `Already registered as "${taken.id}".` };
  }
  if (id === '') return { ok: false, field: 'id', message: 'Enter an id.' };
  if (!REGISTRY_ID_PATTERN.test(id)) {
    return {
      ok: false,
      field: 'id',
      message: 'An id is lowercase letters, digits and dashes.',
    };
  }
  if (current.some((entry) => entry.id === id)) {
    return { ok: false, field: 'id', message: 'That id is already in the registry.' };
  }
  return { ok: true, id, folder };
};
