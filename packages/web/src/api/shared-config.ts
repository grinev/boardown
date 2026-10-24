import { promises as fs } from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import * as csstree from 'css-tree';
import yaml from 'js-yaml';
import { z } from 'zod';
// By relative path into core's sources, like board-api.ts: Vite loads this file
// with its own config, where the workspace package's `.ts` entry cannot resolve.
import { createLogger } from '../../../core/src/logger';
import type { SharedTheme, SharedThemeState } from '../../../core/src/shared-theme';
import { sendJson } from './board-api.js';
import { THEME_TOKENS, type ThemeTokenKind } from './theme-tokens.js';

// The shared configuration directory a host may be started with: settings that
// apply to every board it serves, read with node:fs because they are not board
// data. Read-only — nothing here ever writes, and nothing is created when a file
// is missing. Both hosts build one source and hand it down, like the watch hub.

const log = createLogger('web.shared-config');

const CONFIG_FILE = 'config.yaml';
export const THEMES_DIR = 'themes';

const BUILT_IN: Record<string, SharedTheme> = {
  light: { id: 'light', name: 'Light', base: 'light', tokens: {} },
  dark: { id: 'dark', name: 'Dark', base: 'dark', tokens: {} },
};

const THEME_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Unknown keys are stripped rather than refused, here and in a theme file: a
// directory written for a newer build must still serve an older one.
const configSchema = z.object({
  theme: z
    .string({ error: 'must be a theme name' })
    .regex(THEME_ID_PATTERN, { error: 'must be a plain name of letters, digits, "-" and "_"' })
    .optional(),
});

const themeFileSchema = z.object({
  name: z.string({ error: 'must be a string' }).optional(),
  base: z.enum(['light', 'dark'], { error: 'must be "light" or "dark"' }),
  fontFamily: z.string({ error: 'must be a string' }).optional(),
  tokens: z.record(z.string(), z.unknown(), { error: 'must be an object' }).optional(),
});

const PROPERTY: Record<ThemeTokenKind, string> = { color: 'color', shadow: 'box-shadow' };

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const isMissing = (err: unknown): boolean => {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

const formatIssues = (file: string, error: z.ZodError): string =>
  error.issues
    .map((issue) => {
      const where = issue.path.join('.');
      return where === '' ? `${file}: ${issue.message}` : `${file}: ${where}: ${issue.message}`;
    })
    .join('; ');

// A value with var() in it cannot be judged until the browser computes it, so
// it is accepted the way CSS accepts it; it must still parse as one value.
export const isValidCssValue = (property: string, value: string): boolean => {
  if (value.trim() === '') return false;
  let parseFailed = false;
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(value, {
      context: 'value',
      onParseError: () => {
        parseFailed = true;
      },
    });
  } catch {
    return false;
  }
  if (parseFailed) return false;
  let referencesVar = false;
  csstree.walk(ast, (node) => {
    if (node.type === 'Function' && node.name.toLowerCase() === 'var') referencesVar = true;
  });
  if (referencesVar) return true;
  return csstree.lexer.matchProperty(property, ast).error === null;
};

type Resolution = { ok: true; theme: SharedTheme | null } | { ok: false; error: string };

const readThemeFile = async (dir: string, id: string): Promise<Resolution> => {
  const file = `${THEMES_DIR}/${id}.json`;
  // Matched against the listing rather than opened by name, so a case-insensitive
  // filesystem cannot answer for `Ocean` with ocean.json on one OS and not another.
  let names: string[];
  try {
    names = await fs.readdir(path.join(dir, THEMES_DIR));
  } catch (err) {
    if (isMissing(err)) {
      return { ok: false, error: `${CONFIG_FILE}: theme "${id}" needs ${file}, but ${THEMES_DIR}/ is missing` };
    }
    return { ok: false, error: `${THEMES_DIR}/ cannot be read: ${messageOf(err)}` };
  }
  if (!names.includes(`${id}.json`)) {
    return {
      ok: false,
      error: `${CONFIG_FILE}: theme "${id}" has no file ${file} (the built-in themes are "light" and "dark")`,
    };
  }

  let text: string;
  try {
    text = await fs.readFile(path.join(dir, THEMES_DIR, `${id}.json`), 'utf-8');
  } catch (err) {
    return { ok: false, error: `${file} cannot be read: ${messageOf(err)}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (err) {
    return { ok: false, error: `${file}: invalid JSON: ${messageOf(err)}` };
  }
  const parsed = themeFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: formatIssues(file, parsed.error) };

  const tokens: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed.data.tokens ?? {})) {
    const kind = THEME_TOKENS.get(name);
    // Unknown names are dropped before their value is looked at, so a token a
    // newer build added cannot fail this one whatever it holds.
    if (kind === undefined) continue;
    if (typeof value !== 'string') {
      return { ok: false, error: `${file}: tokens.${name}: must be a string` };
    }
    if (!isValidCssValue(PROPERTY[kind], value)) {
      return { ok: false, error: `${file}: tokens.${name}: "${value}" is not a valid ${PROPERTY[kind]} value` };
    }
    tokens[name] = value;
  }

  const { fontFamily } = parsed.data;
  if (fontFamily !== undefined && !isValidCssValue('font-family', fontFamily)) {
    return { ok: false, error: `${file}: fontFamily: "${fontFamily}" is not a valid font-family value` };
  }

  const name = parsed.data.name?.trim();
  return {
    ok: true,
    theme: {
      id,
      name: name === undefined || name === '' ? id : name,
      base: parsed.data.base,
      ...(fontFamily === undefined ? {} : { fontFamily }),
      tokens,
    },
  };
};

const resolveSharedConfig = async (dir: string): Promise<Resolution> => {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return { ok: false, error: `${dir} is not a folder` };
  } catch (err) {
    return {
      ok: false,
      error: isMissing(err) ? `${dir} does not exist` : `${dir} cannot be read: ${messageOf(err)}`,
    };
  }

  let text: string;
  try {
    text = await fs.readFile(path.join(dir, CONFIG_FILE), 'utf-8');
  } catch (err) {
    return {
      ok: false,
      error: isMissing(err) ? `${CONFIG_FILE} is missing` : `${CONFIG_FILE} cannot be read: ${messageOf(err)}`,
    };
  }
  let raw: unknown;
  try {
    raw = yaml.load(text);
  } catch (err) {
    return { ok: false, error: `${CONFIG_FILE}: invalid YAML: ${messageOf(err)}` };
  }
  const parsed = configSchema.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: formatIssues(CONFIG_FILE, parsed.error) };

  const id = parsed.data.theme;
  if (id === undefined) return { ok: true, theme: null };
  return BUILT_IN[id] !== undefined ? { ok: true, theme: BUILT_IN[id] } : readThemeFile(dir, id);
};

export interface SharedConfigSource {
  /** Absolute path of the configuration directory. */
  dir: string;
  /**
   * Re-reads the directory on every call. A failure answers the last valid
   * theme alongside its message, so a bad edit never blanks a palette.
   */
  read: () => Promise<SharedThemeState>;
}

export const createSharedConfigSource = (dir: string): SharedConfigSource => {
  const absolute = path.resolve(dir);
  let last: SharedTheme | null = null;
  let lastError: string | null = null;

  return {
    dir: absolute,
    read: async () => {
      const result = await resolveSharedConfig(absolute);
      if (result.ok) {
        if (lastError !== null) log.info(`shared configuration ${absolute} is valid again`);
        last = result.theme;
        lastError = null;
        return { theme: last, error: null };
      }
      // Every open tab asks after a change, so the same failure arrives once per
      // tab; only a new message is worth a line.
      if (result.error !== lastError) log.error(`shared configuration ${absolute}: ${result.error}`);
      lastError = result.error;
      return { theme: last, error: result.error };
    },
  };
};

// The hosts' startup: an initial failure refuses to serve at all, the way an
// unusable registry does, instead of starting with no theme and a banner.
export const openSharedConfig = async (dir: string): Promise<SharedConfigSource> => {
  const source = createSharedConfigSource(dir);
  const { error } = await source.read();
  if (error !== null) {
    throw new Error(`Shared configuration ${source.dir} cannot be used: ${error}`);
  }
  return source;
};

const NO_SHARED_THEME: SharedThemeState = { theme: null, error: null };

export const handleSharedTheme = async (
  res: ServerResponse,
  source: SharedConfigSource | undefined,
): Promise<void> => {
  const state = source === undefined ? NO_SHARED_THEME : await source.read();
  log.debug(`shared-theme: ${state.theme?.id ?? 'none'}${state.error === null ? '' : ' (error)'}`);
  sendJson(res, 200, state);
};
