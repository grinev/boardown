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

/**
 * Two entry lists name the same projects. What the write path compares a patched
 * file against before it lets the patch land.
 *
 * Order is not compared, because it is not the file's: an id of digits alone is
 * a valid one, and JavaScript reads an integer-like key back before every other
 * key whatever line it was written on. Ids are unique here — a duplicate key
 * makes the file unparseable long before this — so a pair-for-pair match at the
 * same length is exact.
 */
export const sameEntries = (a: readonly RegistryEntry[], b: readonly RegistryEntry[]): boolean => {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map((entry) => [entry.id, entry.projectRoot]));
  return b.every((entry) => byId.get(entry.id) === entry.projectRoot);
};

export interface RegistryState {
  entries: RegistryEntry[];
  /**
   * Why the file could not be used on the latest attempt. The entries are then
   * the last ones that parsed, so one bad edit does not take open boards down.
   */
  staleReason: string | null;
}

export type RegistryText =
  | { ok: true; text: string | null }
  | { ok: false; error: string };

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

  /**
   * The file as it stands right now, for a write that patches it — the cache is
   * bypassed, because a patch applied to entries parsed a while ago would drop
   * whatever was added to the file by hand since. `text: null` means the file is
   * not there and this registry treats that as empty, so a write creates it.
   */
  async readForWrite(): Promise<RegistryText> {
    try {
      return { ok: true, text: await fs.readFile(this.filePath, 'utf-8') };
    } catch (err) {
      if (this.absentIsEmpty && isAbsent(err)) return { ok: true, text: null };
      return { ok: false, error: messageOf(err) };
    }
  }

  /**
   * Replaces the file's contents. The bytes go to a temporary file beside it and
   * only a complete one is renamed over the target: the registry lives in the
   * OS's configuration folder rather than a repo, so a half-written one has no
   * git to come back from — and would not parse, which is the one state the page
   * cannot repair, since a registry it cannot read is a registry it will not patch.
   *
   * Forgetting the mtime rather than adopting the new text is what makes the next
   * `read()` come from disk: the cache turns over on a millisecond, and a write
   * fast enough not to move it would otherwise be invisible to the very next read.
   */
  async writeText(text: string): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}-${Date.now()}.tmp`;
    try {
      await fs.writeFile(temp, text, 'utf-8');
      await fs.rename(temp, this.filePath);
    } catch (err) {
      await fs.rm(temp, { force: true });
      throw err;
    }
    this.mtimeMs = -1;
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
