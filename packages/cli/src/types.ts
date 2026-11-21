import type { ParseProblem, TaskIdRepair } from '@boardown/core';
import type { ParsedArgs } from './args';

export interface CommandContext {
  cwd: string;
  json: boolean;
  dataDir?: string;
  reportRepairs?: (repairs: TaskIdRepair[]) => void;
}

export interface CommandOutput {
  data: unknown;
  human: string;
  problems?: ParseProblem[];
  repairs?: TaskIdRepair[];
}

export type CommandHandler = (
  args: ParsedArgs,
  ctx: CommandContext,
) => CommandOutput | Promise<CommandOutput>;
