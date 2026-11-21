import { promises as fs, watchFile, unwatchFile } from 'node:fs';
import path from 'node:path';
import {
  appendRegistrations,
  chooseProjectRegistration,
  dropRegistration,
  legacyProjectAdditions,
  parseProjectRegistry,
  type ProjectRegistration,
  type RegistryFolder,
} from '@boardown/core';
import { withFileLock } from './file-lock.js';
import {
  canonicalPath,
  errorCode,
  errorMessage,
  isAbsolutePath,
  pathKey,
  readOptional,
  replaceText,
} from './files.js';

export interface BoardRoots {
  projectRoot: string;
  boardRoot: string;
}

export const rootsFromProjectFolder = (folder: string): BoardRoots => {
  const projectRoot = path.resolve(folder);
  return { projectRoot, boardRoot: path.join(projectRoot, '.boardown') };
};

export interface RegistryEntry extends BoardRoots {
  id: string;
}

export interface RegistryState {
  entries: RegistryEntry[];
  staleReason: string | null;
}

export class RegistryError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409,
  ) {
    super(message);
  }
}

async function identify(projectRoot: string): Promise<RegistryFolder> {
  const canonical = await canonicalPath(projectRoot);
  return {
    projectRoot,
    basename: path.basename(projectRoot),
    key: pathKey(canonical),
  };
}

const identifyEntries = (entries: readonly ProjectRegistration[]) =>
  inBatches(entries, async (entry) => ({ ...(await identify(entry.projectRoot)), id: entry.id }));

export async function inBatches<T, U>(
  items: readonly T[],
  read: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = [];
  for (let start = 0; start < items.length; start += 16) {
    results.push(...(await Promise.all(items.slice(start, start + 16).map(read))));
  }
  return results;
}

function parse(text: string): ProjectRegistration[] {
  const result = parseProjectRegistry(text, isAbsolutePath);
  if (!result.ok)
    throw new RegistryError(`The registry file could not be read: ${result.error}`, 409);
  return result.entries;
}

export class RegistryFile {
  private last: RegistryEntry[] | null = null;
  private revision: string | null = null;
  private initialization: Promise<void> | undefined;

  constructor(
    readonly filePath: string,
    private readonly options: {
      absentIsEmpty?: boolean;
      initialize?: (registry: RegistryFile) => Promise<void>;
    } = {},
  ) {}

  get loaded(): boolean {
    return this.last !== null;
  }

  async key(): Promise<string> {
    return pathKey(await canonicalPath(this.filePath));
  }

  async findFolder(folder: string): Promise<RegistryEntry | null> {
    const identity = pathKey(await canonicalPath(folder));
    const { entries } = await this.read();
    const match = (await identifyEntries(entries)).find(({ key }) => key === identity);
    return entries.find(({ id }) => id === match?.id) ?? null;
  }

  private ready(): Promise<void> {
    if (this.options.initialize === undefined) return Promise.resolve();
    this.initialization ??= this.options.initialize(this).catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }

  async read(): Promise<RegistryState> {
    try {
      await this.ready();
    } catch (error) {
      return { entries: this.last ?? [], staleReason: errorMessage(error) };
    }
    try {
      const stat = await fs.stat(this.filePath);
      const revision = `${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
      if (this.last === null || revision !== this.revision) {
        const text = await fs.readFile(this.filePath, 'utf8');
        this.last = parse(text).map(({ id, projectRoot }) => ({
          id,
          ...rootsFromProjectFolder(projectRoot),
        }));
        this.revision = revision;
      }
      return { entries: this.last, staleReason: null };
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        this.revision = null;
        if (this.options.absentIsEmpty === true) {
          this.last = [];
          return { entries: [], staleReason: null };
        }
        this.last = null;
      }
      return { entries: this.last ?? [], staleReason: errorMessage(error) };
    }
  }

  watch(notify: () => void): () => void {
    watchFile(this.filePath, { persistent: false, interval: 750 }, notify);
    return () => unwatchFile(this.filePath, notify);
  }

  private async transact<T>(
    edit: (
      text: string | null,
      current: ProjectRegistration[],
    ) => Promise<{
      text: string | null;
      value: T;
    }>,
  ): Promise<T> {
    return withFileLock(this.filePath, async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const text = await readOptional(this.filePath);
        if (text === null && this.options.absentIsEmpty !== true) {
          throw new RegistryError(`The registry file does not exist: ${this.filePath}`, 409);
        }
        const result = await edit(text, text === null ? [] : parse(text));
        if (result.text === text || result.text === null) return result.value;
        // An editor need not obey the app's lock. Do not overwrite a change we saw.
        if ((await readOptional(this.filePath)) !== text) continue;
        await replaceText(this.filePath, result.text);
        this.revision = null;
        return result.value;
      }
      throw new RegistryError('The registry changed while it was being edited. Try again.', 409);
    });
  }

  async register(rawFolder: string, requestedId?: string): Promise<string> {
    await this.ready();
    if (!path.isAbsolute(rawFolder) || rawFolder.includes('\0')) {
      throw new RegistryError('The project path must be absolute.', 400);
    }
    const canonical = await canonicalPath(rawFolder);
    if (!(await isProjectDirectory(canonical))) {
      throw new RegistryError('The project path must name an available folder.', 400);
    }
    const folder = {
      projectRoot: canonical,
      key: pathKey(canonical),
      basename: path.basename(canonical),
    };
    return this.transact(async (text, current) => {
      const result = chooseProjectRegistration(await identifyEntries(current), folder, requestedId);
      if (!result.ok) throw new RegistryError(result.message, result.conflict ? 409 : 400);
      if (result.existing) return { text, value: result.id };
      const patch = appendRegistrations(
        text,
        current,
        [{ id: result.id, projectRoot: canonical }],
        isAbsolutePath,
      );
      if (!patch.ok) throw new RegistryError(patch.message, 409);
      return { text: patch.text, value: result.id };
    });
  }

  async remove(id: string): Promise<void> {
    await this.ready();
    await this.transact((text, current) => {
      if (text === null || !current.some((entry) => entry.id === id)) {
        return Promise.resolve({ text, value: undefined });
      }
      const patch = dropRegistration(text, current, id, isAbsolutePath);
      if (!patch.ok) throw new RegistryError(patch.message, 409);
      return Promise.resolve({ text: patch.text, value: undefined });
    });
  }

  async importLegacy(
    oldWeb: readonly ProjectRegistration[],
    electron: readonly string[],
  ): Promise<void> {
    await this.transact(async (text, current) => {
      const [shared, legacy, folders] = await Promise.all([
        identifyEntries(current),
        identifyEntries(oldWeb),
        inBatches(electron, identify),
      ]);
      const additions = legacyProjectAdditions(shared, legacy, folders);
      if (additions.length === 0) return { text, value: undefined };
      const patch = appendRegistrations(text, current, additions, isAbsolutePath);
      if (!patch.ok) throw new RegistryError(patch.message, 409);
      return { text: patch.text, value: undefined };
    });
  }
}

export async function isProjectDirectory(folder: string): Promise<boolean> {
  try {
    return (await fs.stat(folder)).isDirectory();
  } catch {
    return false;
  }
}
