import path from 'node:path';

// Where boardown-web keeps its own registry when nobody named one. It is the
// shell's state rather than board data, so it lives with the OS's user
// configuration instead of anywhere near a project — a server started from a
// shortcut has no meaningful working directory to resolve against.
//
// The platform and the environment arrive as arguments: only bin.ts touches
// `process` and `node:os`, and every branch here is then reachable from a test
// without stubbing a global.

export const CONFIG_FOLDER_NAME = 'boardown-web';
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
      paths.join(homeOf(host, paths, 'neither APPDATA nor an absolute home directory'), 'AppData', 'Roaming')
    );
  }
  if (host.platform === 'darwin') {
    return paths.join(homeOf(host, paths, 'no absolute home directory'), 'Library', 'Application Support');
  }
  return (
    absoluteEnv(paths, host.env.XDG_CONFIG_HOME) ??
    paths.join(homeOf(host, paths, 'neither XDG_CONFIG_HOME nor an absolute home directory'), '.config')
  );
};

export const defaultRegistryPath = (host: RegistryHost): string => {
  const paths = pathsFor(host.platform);
  return paths.join(configFolder(host, paths), CONFIG_FOLDER_NAME, REGISTRY_FILE_NAME);
};
