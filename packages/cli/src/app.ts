import { parseArgs } from './args';
import { boardCommand } from './commands/board';
import { epicCommand } from './commands/epic';
import { initCommand } from './commands/init';
import { releaseCommand } from './commands/release';
import { schemaCommand } from './commands/schema';
import { taskCommand } from './commands/task';
import { CliError, errEnvelope, okEnvelope } from './output';
import type { CommandContext, CommandHandler } from './types';

const COMMANDS: Record<string, CommandHandler> = {
  board: boardCommand,
  task: taskCommand,
  release: releaseCommand,
  epic: epicCommand,
  init: initCommand,
  schema: schemaCommand,
};

const HELP = `boardown — markdown task board CLI

Usage: boardown <command> [args] [--data-dir <path>] [--json]

Commands:
  board                  Print the whole board.
  init                   Create a .boardown/ board here.
  task get <id>          Show one task and where it lives.
  task add <title>       Create a task (--type --status --epic --release --description).
  task edit <id>         Edit a task; --release/--no-release also move it in/out of a release.
  task status <id> <s>   Change a task status (todo | in-progress | done).
  task reorder <id>      Change priority (--before | --after <id> | --up | --down).
  task rm <id>           Delete a task.
  task checklist <op>    Checklist item: add | done | undone | edit | rm (on <id>).
  task notes <op>        Note: add | edit | rm (on <id>).
  release get <ref>      Show one release and its tasks.
  release list           List releases.
  release current        Show the current release and its tasks.
  release add <name>     Create a release (--description).
  release start <ref>    Make a release current.
  release done <ref>     Finish a release (--into <release> to carry over open tasks).
  epic get <slug>        Show one epic and its tasks.
  epic list              List epics.
  epic add <name>        Create an epic (--color #rrggbb --description).
  epic edit <slug>       Edit an epic (--name --description).
  schema                 Print the machine-readable command/enum contract.

Output is JSON when stdout is piped, or with --json. Run \`boardown schema\` for
the full contract agents can branch on.`;

export interface RunOptions {
  cwd?: string;
}

export async function run(argv: readonly string[], opts: RunOptions = {}): Promise<number> {
  const args = parseArgs(argv);
  const command = args.positionals[0];
  const json = args.flags.json === true || process.stdout.isTTY !== true;

  if (command === undefined || command === 'help' || args.flags.help === true) {
    if (json) {
      process.stdout.write(
        `${JSON.stringify({ ok: true, command: 'help', data: { commands: Object.keys(COMMANDS) } })}\n`,
      );
    } else {
      process.stdout.write(`${HELP}\n`);
    }
    return 0;
  }

  const handler = COMMANDS[command];
  if (handler === undefined) {
    const err = new CliError(
      'UNKNOWN_COMMAND',
      `Unknown command "${command}". Try: ${Object.keys(COMMANDS).join(', ')}.`,
      2,
    );
    emitError(command, err, json);
    return err.exitCode;
  }

  const dataDir = typeof args.flags['data-dir'] === 'string' ? args.flags['data-dir'] : undefined;
  const ctx: CommandContext = {
    cwd: opts.cwd ?? process.cwd(),
    json,
    ...(dataDir !== undefined ? { dataDir } : {}),
  };

  try {
    const out = await handler(args, ctx);
    if (json) {
      process.stdout.write(`${JSON.stringify(okEnvelope(command, out.data, out.problems ?? []))}\n`);
    } else {
      process.stdout.write(`${out.human}\n`);
      for (const problem of out.problems ?? []) {
        process.stderr.write(`! ${problem.file}: ${problem.message}\n`);
      }
    }
    return 0;
  } catch (err) {
    const cliErr =
      err instanceof CliError
        ? err
        : new CliError('ERROR', err instanceof Error ? err.message : String(err));
    emitError(command, cliErr, json);
    return cliErr.exitCode;
  }
}

function emitError(command: string, err: CliError, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(errEnvelope(command, err))}\n`);
    return;
  }
  process.stderr.write(`error: ${err.message}\n`);
  for (const problem of err.problems) {
    process.stderr.write(`! ${problem.file}: ${problem.message}\n`);
  }
}
