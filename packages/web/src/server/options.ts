import path from 'node:path';
import type { ServeMode } from './http-server.js';
import { RegistryFile } from './registry.js';
import { rootsFromBoardFolder, type BoardRoots } from './roots.js';

export class UsageError extends Error {}

export interface CliArgs {
  dataDir?: string;
  registry?: string;
  port?: number;
}

const VALUE_FLAGS = ['--data-dir', '--registry', '--port'] as const;

export const parseArgs = (argv: readonly string[]): CliArgs => {
  const args: CliArgs = {};
  const take = (flag: string, value: string | undefined): string => {
    if (value === undefined || value === '') {
      throw new UsageError(`Missing value for ${flag}`);
    }
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (!(VALUE_FLAGS as readonly string[]).includes(flag)) {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    let value: string;
    if (eq === -1) {
      value = take(flag, argv[i + 1]);
      i += 1;
    } else {
      value = take(flag, arg.slice(eq + 1));
    }
    if (flag === '--data-dir') args.dataDir = value;
    else if (flag === '--registry') args.registry = value;
    else {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new UsageError(`--port must be a port number, got "${value}"`);
      }
      args.port = port;
    }
  }
  if (args.dataDir !== undefined && args.registry !== undefined) {
    throw new UsageError('--data-dir and --registry name different things; pass only one');
  }
  return args;
};

export interface ResolvedMode {
  mode: ServeMode;
  /** Set in registry mode, so the startup lines can name every project. */
  registry: RegistryFile | null;
  /** Set in single-board mode, so the startup lines can name the board. */
  singleRoots: BoardRoots | null;
}

// The two flags do not name the same thing: a registry entry is a project
// folder, while --data-dir names the board folder itself, the way the dev shell
// has always meant it. With neither, the source is the default registry, which
// bin.ts knows how to locate — this file stays out of the business of platforms,
// and asks for the path only on the branch that needs it, so a machine with no
// resolvable home can still run --data-dir.
export const resolveMode = async (
  args: CliArgs,
  cwd: string,
  defaultRegistryPath: () => string,
): Promise<ResolvedMode> => {
  if (args.dataDir !== undefined) {
    const singleRoots = rootsFromBoardFolder(path.resolve(cwd, args.dataDir));
    return { mode: { kind: 'single', roots: singleRoots }, registry: null, singleRoots };
  }
  const registry =
    args.registry !== undefined
      ? new RegistryFile(path.resolve(cwd, args.registry))
      : new RegistryFile(defaultRegistryPath(), { absentIsEmpty: true });
  const state = await registry.read();
  if (!registry.loaded) {
    throw new Error(`Registry ${registry.filePath} cannot be used: ${state.staleReason ?? ''}`);
  }
  return { mode: { kind: 'registry', registry }, registry, singleRoots: null };
};
