import { basename, isAbsolute, resolve } from 'node:path';
import { CONFIG_FILENAME, ID_PREFIX_REGEX, serializeConfig, type BoardConfig } from '@boardown/core';
import { flagString } from '../args';
import { BOARD_DIRNAME } from '../board-root';
import { NodeFsAdapter } from '../node-fs';
import { CliError } from '../output';
import type { CommandHandler } from '../types';

export const initCommand: CommandHandler = async (args, ctx) => {
  const projectDir = resolve(ctx.cwd);
  const boardRoot =
    ctx.dataDir !== undefined
      ? isAbsolute(ctx.dataDir)
        ? ctx.dataDir
        : resolve(ctx.cwd, ctx.dataDir)
      : resolve(projectDir, BOARD_DIRNAME);

  const fs = new NodeFsAdapter(boardRoot);
  if ((await fs.stat(CONFIG_FILENAME)) !== null) {
    throw new CliError('ALREADY_INITIALIZED', `Board already initialized at ${boardRoot}.`);
  }

  const idPrefix = flagString(args.flags, 'id-prefix') ?? 'TASK';
  if (!ID_PREFIX_REGEX.test(idPrefix)) {
    throw new CliError('USAGE', `--id-prefix must be 2-5 uppercase letters (got "${idPrefix}").`, 2);
  }

  const projectNameFlag = flagString(args.flags, 'project-name');
  if (projectNameFlag !== undefined && projectNameFlag.length === 0) {
    throw new CliError('USAGE', '--project-name cannot be empty.', 2);
  }
  const projectName = projectNameFlag ?? (basename(projectDir) || 'Board');

  const config: BoardConfig = { idPrefix, nextId: 1, projectName };

  await fs.write(CONFIG_FILENAME, serializeConfig(config));

  return {
    data: { boardRoot },
    human: `Initialized boardown at ${boardRoot} (idPrefix ${idPrefix}, project "${projectName}").`,
  };
};
