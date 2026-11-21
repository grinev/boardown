import type { ParseProblem, TaskIdRepair } from '@boardown/core';

// A failure the CLI can describe to the caller: a stable `code` for agents to
// branch on, a human `message`, and an `exitCode` (1 = operation failed,
// 2 = usage error).
export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number = 1,
    readonly problems: ParseProblem[] = [],
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export interface OkEnvelope {
  ok: true;
  data: unknown;
  problems?: ParseProblem[];
  repairs?: TaskIdRepair[];
}

export interface ErrEnvelope {
  ok: false;
  error: { code: string; message: string };
  problems?: ParseProblem[];
}

export function okEnvelope(data: unknown, problems: ParseProblem[], repairs: TaskIdRepair[] = []): OkEnvelope {
  return {
    ok: true, data,
    ...(problems.length > 0 ? { problems } : {}),
    ...(repairs.length > 0 ? { repairs } : {}),
  };
}

export const renderRepairs = (repairs: readonly TaskIdRepair[]): string =>
  repairs.map(({ oldId, newId, title, file }) => `${oldId} → ${newId}: "${title}" (${file})`).join('\n');

export function errEnvelope(err: CliError): ErrEnvelope {
  const base: ErrEnvelope = {
    ok: false,
    error: { code: err.code, message: err.message },
  };
  return err.problems.length > 0 ? { ...base, problems: err.problems } : base;
}
