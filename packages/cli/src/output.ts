import type { ParseProblem } from '@boardown/core';

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
  command: string;
  data: unknown;
  problems?: ParseProblem[];
}

export interface ErrEnvelope {
  ok: false;
  command: string;
  error: { code: string; message: string };
  problems?: ParseProblem[];
}

export function okEnvelope(
  command: string,
  data: unknown,
  problems: ParseProblem[],
): OkEnvelope {
  return problems.length > 0
    ? { ok: true, command, data, problems }
    : { ok: true, command, data };
}

export function errEnvelope(command: string, err: CliError): ErrEnvelope {
  const base: ErrEnvelope = {
    ok: false,
    command,
    error: { code: err.code, message: err.message },
  };
  return err.problems.length > 0 ? { ...base, problems: err.problems } : base;
}
