import { parseArgs } from './args';
import { archiveCommand } from './commands/archive';
import { backlogCommand } from './commands/backlog';
import { epicCommand } from './commands/epic';
import { initCommand } from './commands/init';
import { releaseCommand } from './commands/release';
import { schemaCommand } from './commands/schema';
import { taskCommand } from './commands/task';
import { CliError, errEnvelope, okEnvelope } from './output';
import type { CommandContext, CommandHandler } from './types';

const COMMANDS: Record<string, CommandHandler> = {
  backlog: backlogCommand,
  archive: archiveCommand,
  task: taskCommand,
  release: releaseCommand,
  epic: epicCommand,
  init: initCommand,
  schema: schemaCommand,
};

const HELP = `boardown — markdown task board CLI

Usage: boardown <command> [args] [--data-dir <path>] [--json]

Views — what you look at first:
  release current        The board: the current release and its tasks.
  backlog                Current + future releases and the unscheduled backlog.
  archive                Finished releases.

Tasks:
  task get <id>          Show one task in full — the drill-down.
  task list              List/filter tasks (--status --type --epic --release --backlog --text).
  task add <title>       Create a task (--type --status --epic --release --description).
  task edit <id>         Edit a task; --release/--no-release also move it in/out of a release.
  task status <id> <s>   Change a task status (todo | in-progress | done).
  task reorder <id>      Change priority (--before | --after <id> | --up | --down).
  task rm <id>           Delete a task.
  task checklist <op>    Checklist item: add | done | undone | edit | rm (on <id>).
  task notes <op>        Note: add | edit | rm (on <id>).
  task link <op>         Link to another task: add | rm (<id> <other-id>) | ls <id>.

Releases and epics:
  release get <ref>      Show one release and its tasks.
  release list           List releases with task counts.
  release add <name>     Create a release (--description).
  release start <ref>    Make a release current.
  release done <ref>     Finish a release (--into <release> to carry over open tasks).
  epic get <slug>        Show one epic and its tasks.
  epic list              List epics with task counts.
  epic add <name>        Create an epic (--color #rrggbb --description).
  epic edit <slug>       Edit an epic (--name --description).

Other:
  init                   Create a .boardown/ board here.
  schema                 Print the machine-readable command/enum contract.

Lists show a task summary; \`task get\` shows everything. --full takes any listing
command one level deeper. Output is JSON when stdout is piped, or with --json.
Run \`boardown schema\` for the full contract agents can branch on.`;

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
        `${JSON.stringify({ ok: true, data: { commands: Object.keys(COMMANDS) } })}\n`,
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
    emitError(err, json);
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
      process.stdout.write(`${JSON.stringify(okEnvelope(out.data, out.problems ?? []))}\n`);
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
    emitError(cliErr, json);
    return cliErr.exitCode;
  }
}

function emitError(err: CliError, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(errEnvelope(err))}\n`);
    return;
  }
  process.stderr.write(`error: ${err.message}\n`);
  for (const problem of err.problems) {
    process.stderr.write(`! ${problem.file}: ${problem.message}\n`);
  }
}
