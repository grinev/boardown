import type { ParseProblem } from '@boardown/core';
import type { ParsedArgs } from './args';

export interface CommandContext {
  cwd: string;
  json: boolean;
  dataDir?: string;
}

export interface CommandOutput {
  data: unknown;
  human: string;
  problems?: ParseProblem[];
}

export type CommandHandler = (
  args: ParsedArgs,
  ctx: CommandContext,
) => CommandOutput | Promise<CommandOutput>;
