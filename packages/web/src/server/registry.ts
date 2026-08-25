import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { rootsFromProjectFolder, type BoardRoots } from './roots.js';

// The registry is configuration, so it is validated rather than trusted, and a
// value that breaks the schema makes the file invalid rather than being skipped:
// an id that cannot be a URL segment has no honest fallback. A folder that is
// merely missing is a different thing — the world not matching the file — and is
// isolated per row by the list page instead.

export const REGISTRY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface RegistryEntry extends BoardRoots {
  id: string;
}

// The shape is Zod's; the id and the path are checked after it. A record key
// that fails a schema reports only "invalid key in record", and the whole point
// of refusing the start is telling the user which line to fix.
const registrySchema = z.object({
  projects: z.record(z.string(), z.string()),
});

export type RegistryParse =
  | { ok: true; entries: RegistryEntry[] }
  | { ok: false; error: string };

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const parseRegistry = (text: string): RegistryParse => {
  let raw: unknown;
  try {
    raw = yaml.load(text);
  } catch (err) {
    return { ok: false, error: `invalid YAML: ${messageOf(err)}` };
  }
  const result = registrySchema.safeParse(raw ?? {});
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const where = issue.path.join('.');
        return where === '' ? issue.message : `${where}: ${issue.message}`;
      })
      .join('; ');
    return { ok: false, error: issues };
  }
  const entries: RegistryEntry[] = [];
  for (const [id, folder] of Object.entries(result.data.projects)) {
    if (!REGISTRY_ID_PATTERN.test(id)) {
      return {
        ok: false,
        error: `id "${id}" must be lowercase letters, digits and dashes`,
      };
    }
    if (folder === '') {
      return { ok: false, error: `"${id}" has no path` };
    }
    if (!path.isAbsolute(folder)) {
      return { ok: false, error: `"${id}" must name an absolute path, got "${folder}"` };
    }
    entries.push({ id, ...rootsFromProjectFolder(folder) });
  }
  return { ok: true, entries };
};

export interface RegistryState {
  entries: RegistryEntry[];
  /**
   * Why the file could not be used on the latest attempt. The entries are then
   * the last ones that parsed, so one bad edit does not take open boards down.
   */
  staleReason: string | null;
}

export interface RegistryFileOptions {
  /**
   * Whether a file that is simply not there counts as a registry with no
   * projects. True for the default registry, which the server owns and nothing
   * has written yet; false for `--registry`, where a path that names nothing is
   * a typo the user has to see. Only absence is covered — a path that exists and
   * cannot be read is a failure either way.
   */
  absentIsEmpty?: boolean;
}

const isAbsent = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'ENOENT';

export class RegistryFile {
  private entries: RegistryEntry[] | null = null;
  private mtimeMs = -1;
  private staleReason: string | null = null;
  private readonly absentIsEmpty: boolean;

  constructor(
    readonly filePath: string,
    options: RegistryFileOptions = {},
  ) {
    this.absentIsEmpty = options.absentIsEmpty ?? false;
  }

  /** True once the file has parsed at least one time. */
  get loaded(): boolean {
    return this.entries !== null;
  }

  // Re-parses only when the modification time moved. A failed attempt leaves the
  // cached mtime alone, so a file that gets fixed is picked up on the next call.
  async read(): Promise<RegistryState> {
    let mtimeMs: number;
    try {
      mtimeMs = (await fs.stat(this.filePath)).mtimeMs;
    } catch (err) {
      if (this.absentIsEmpty && isAbsent(err)) return this.empty();
      return this.fail(messageOf(err));
    }
    if (this.entries !== null && mtimeMs === this.mtimeMs) {
      return { entries: this.entries, staleReason: this.staleReason };
    }
    let text: string;
    try {
      text = await fs.readFile(this.filePath, 'utf-8');
    } catch (err) {
      if (this.absentIsEmpty && isAbsent(err)) return this.empty();
      return this.fail(messageOf(err));
    }
    const parsed = parseRegistry(text);
    if (!parsed.ok) {
      return this.fail(parsed.error);
    }
    this.entries = parsed.entries;
    this.mtimeMs = mtimeMs;
    this.staleReason = null;
    return { entries: parsed.entries, staleReason: null };
  }

  // A file that is not there registers nothing, so entries it once held are
  // dropped rather than kept as the last version that worked. Forgetting the
  // mtime is what lets a file written afterwards be picked up.
  private empty(): RegistryState {
    this.entries = [];
    this.mtimeMs = -1;
    this.staleReason = null;
    return { entries: [], staleReason: null };
  }

  private fail(reason: string): RegistryState {
    this.staleReason = reason;
    return { entries: this.entries ?? [], staleReason: reason };
  }
}
