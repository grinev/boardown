import yaml from 'js-yaml';
import {
  parseProjectRegistry,
  sameRegistrations,
  type IsAbsolutePath,
  type ProjectRegistration,
} from './project-registry.js';

// The registry file is patched as text, never re-serialized from what it parsed
// to: it is the user's file, it may hold comments and an order chosen by hand,
// and a status change that shows up as a one-line diff is the same promise the
// board files make.
//
// Whatever the patcher does is checked before it lands: `verify` re-parses the
// text it produced and compares the entries against the ones the edit meant to
// leave behind. A shape of file it reads wrongly becomes a refusal rather than a
// corrupted registry, which is what lets it stay this simple.

type EditResult = { ok: true; text: string } | { ok: false; message: string };

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

const indentOf = (line: string): string => /^\s*/.exec(line)?.[0] ?? '';

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

const unpatchable: EditResult = {
  ok: false,
  message: 'The registry file is not in a shape the app can edit — edit it by hand instead.',
};

/** The patch is only allowed to land if the file it produced holds exactly the
 *  entries the edit meant to leave behind. */
const verify = (
  text: string,
  expected: readonly ProjectRegistration[],
  isAbsolute: IsAbsolutePath,
): EditResult => {
  const parsed = parseProjectRegistry(text, isAbsolute);
  if (!parsed.ok || !sameRegistrations(parsed.entries, expected)) return unpatchable;
  return { ok: true, text };
};

/**
 * Appends new entries in one verified patch, including on first migration.
 */
export const appendRegistrations = (
  text: string | null,
  current: readonly ProjectRegistration[],
  additions: readonly ProjectRegistration[],
  isAbsolute: IsAbsolutePath,
): EditResult => {
  const expected = [...current, ...additions];
  if (text === null) {
    const lines = additions.map(({ id, projectRoot }) => `  ${entryLine(id, projectRoot)}`);
    return verify(`projects:\n${lines.join('\n')}\n`, expected, isAbsolute);
  }
  const lines = linesOf(text);
  const block = findBlock(lines);
  if (block === null) return unpatchable;
  const cr = crOf(text);
  const added = additions.map(
    ({ id, projectRoot }) => `${block.entryIndent}${entryLine(id, projectRoot)}${cr}`,
  );
  const last = block.entryLines[block.entryLines.length - 1];
  if (last === undefined) {
    // No entries yet, so the key still carries a `{}` that has to give way to a
    // block before a line can be inserted under it. Any trailing comment on that
    // line is the user's and stays.
    const empty = EMPTY_FLOW.exec(block.value);
    if (block.value.trim() !== '' && empty === null) return unpatchable;
    const comment = empty?.[1];
    lines[block.keyLine] =
      `${block.keyIndent}projects:${comment === undefined ? '' : ` ${comment}`}${cr}`;
    lines.splice(block.keyLine + 1, 0, ...added);
  } else {
    lines.splice(last + 1, 0, ...added);
  }
  settleEnd(lines, text);
  return verify(joinLines(lines), expected, isAbsolute);
};

/**
 * Drops one entry. Emptying the block turns the key back into `{}`, because a
 * bare `projects:` parses as null and would leave the file unreadable — a Remove
 * that breaks the file it edits is not a Remove.
 */
export const dropRegistration = (
  text: string,
  current: readonly ProjectRegistration[],
  id: string,
  isAbsolute: IsAbsolutePath,
): EditResult => {
  const expected = current.filter((entry) => entry.id !== id);
  const lines = linesOf(text);
  const block = findBlock(lines);
  if (block === null) return unpatchable;
  const target = block.entryLines.find((i) => keyOf(lines[i] ?? '') === id);
  if (target === undefined) return unpatchable;
  lines.splice(target, 1);
  if (block.entryLines.length === 1) {
    const trailing = block.value.trim();
    lines[block.keyLine] =
      `${block.keyIndent}projects: {}${trailing === '' ? '' : ` ${trailing}`}${crOf(text)}`;
  }
  settleEnd(lines, text);
  return verify(joinLines(lines), expected, isAbsolute);
};
