import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { parseProjectRegistry, type ProjectRegistration } from '@boardown/core';
import { canonicalPath, isAbsolutePath, readOptional } from './files.js';
import { ProjectStateFile } from './project-state.js';
import { RegistryFile } from './registry-file.js';

// Where boardown-web keeps its own registry when nobody named one. It is the
// shell's state rather than board data, so it lives with the OS's user
// configuration instead of anywhere near a project — a server started from a
// shortcut has no meaningful working directory to resolve against.
//
// The platform and the environment arrive as arguments: only bin.ts touches
// `process` and `node:os`, and every branch here is then reachable from a test
// without stubbing a global.

export const CONFIG_FOLDER_NAME = 'boardown';
export const REGISTRY_FILE_NAME = 'projects.yaml';

export interface RegistryHost {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homedir: () => string;
}

/** The given platform's own rules, not the running one's: `C:\Users\me` is an
 *  absolute path when the answer is a Windows path and nothing when it is not.
 *  On the machine each branch actually runs on the two are the same object. */
const pathsFor = (platform: NodeJS.Platform): path.PlatformPath =>
  platform === 'win32' ? path.win32 : path.posix;

/** A blank value is an unset one, and a relative one would put the file next to
 *  whatever directory the server happened to start in — the thing this default
 *  exists to stop. Both fall through to the home directory. */
const absoluteEnv = (paths: path.PlatformPath, value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed !== '' && paths.isAbsolute(trimmed) ? trimmed : null;
};

/** `missing` names everything the branch tried, so the message says what to set.
 *  A relative home is held to the same rule as a relative variable: the lookup
 *  hands back `$HOME` unchecked, and a relative one would land the file beside
 *  whatever folder the server started in. */
const homeOf = (host: RegistryHost, paths: path.PlatformPath, missing: string): string => {
  let home: string;
  try {
    home = host.homedir();
  } catch {
    home = '';
  }
  const trimmed = home.trim();
  if (!paths.isAbsolute(trimmed)) {
    throw new Error(
      `Cannot find the default registry: ${missing} is set. ` +
        'Name a board with --data-dir or a registry with --registry.',
    );
  }
  return trimmed;
};

const configFolder = (host: RegistryHost, paths: path.PlatformPath): string => {
  if (host.platform === 'win32') {
    return (
      absoluteEnv(paths, host.env.APPDATA) ??
      paths.join(
        homeOf(host, paths, 'neither APPDATA nor an absolute home directory'),
        'AppData',
        'Roaming',
      )
    );
  }
  if (host.platform === 'darwin') {
    return paths.join(
      homeOf(host, paths, 'no absolute home directory'),
      'Library',
      'Application Support',
    );
  }
  return (
    absoluteEnv(paths, host.env.XDG_CONFIG_HOME) ??
    paths.join(
      homeOf(host, paths, 'neither XDG_CONFIG_HOME nor an absolute home directory'),
      '.config',
    )
  );
};

export const defaultRegistryPath = (host: RegistryHost = systemHost()): string => {
  const paths = pathsFor(host.platform);
  return paths.join(configFolder(host, paths), CONFIG_FOLDER_NAME, REGISTRY_FILE_NAME);
};

const systemHost = (): RegistryHost => ({
  platform: process.platform,
  env: process.env,
  homedir: os.homedir,
});

export const defaultStatePath = (host: RegistryHost = systemHost()): string => {
  const paths = pathsFor(host.platform);
  return paths.join(paths.dirname(defaultRegistryPath(host)), 'project-state.json');
};

const recentFolders = z.array(z.object({ folder: z.string() }));
const legacySettings = z.object({ lastFolder: z.string().optional() });

async function legacyWeb(file: string): Promise<ProjectRegistration[]> {
  const text = await readOptional(file);
  if (text === null) return [];
  const result = parseProjectRegistry(text, isAbsolutePath);
  if (!result.ok) throw new Error(`Cannot import legacy registry ${file}: ${result.error}`);
  return result.entries;
}

async function legacyElectron(dir: string): Promise<string[]> {
  const recentPath = path.join(dir, 'recent-folders.json');
  const settingsPath = path.join(dir, 'settings.json');
  const [recent, settings] = await Promise.all([
    readOptional(recentPath),
    readOptional(settingsPath),
  ]);
  const folders =
    recent === null ? [] : recentFolders.parse(JSON.parse(recent)).map(({ folder }) => folder);
  if (settings !== null) {
    const { lastFolder } = legacySettings.parse(JSON.parse(settings));
    if (lastFolder !== undefined) folders.push(lastFolder);
  }
  return folders.filter((folder) => path.isAbsolute(folder) && !folder.includes('\0'));
}

export async function openDefaultRegistry(
  host: RegistryHost = systemHost(),
): Promise<RegistryFile> {
  const file = await canonicalPath(defaultRegistryPath(host));
  const configDir = path.dirname(defaultRegistryPath(host));
  const state = new ProjectStateFile(await canonicalPath(defaultStatePath(host)));
  const oldWeb = path.join(path.dirname(configDir), 'boardown-web', REGISTRY_FILE_NAME);
  return new RegistryFile(file, {
    absentIsEmpty: true,
    async initialize(registry) {
      if ((await state.read()).defaultRegistryMigrated) return;
      await state.update(async (current) => {
        if (current.defaultRegistryMigrated) return current;
        const [web, electron] = await Promise.all([legacyWeb(oldWeb), legacyElectron(configDir)]);
        await registry.importLegacy(web, electron);
        return { ...current, defaultRegistryMigrated: true };
      });
    },
  });
}

export async function openNamedRegistry(file: string): Promise<RegistryFile> {
  return new RegistryFile(await canonicalPath(file));
}
