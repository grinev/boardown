import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import skillText from '../../skills/boardown/SKILL.md';
import { flagBool, type ParsedArgs } from '../args';
import { isENOENT } from '../node-fs';
import { CliError } from '../output';
import { loadConfigIfAny, resolveBoardRoot } from '../persistence';
import type { CommandContext, CommandHandler, CommandOutput } from '../types';

const SKILL_NAME = 'boardown';

// Claude Code reads only its own directory; Codex, OpenCode and the other agents
// that follow the shared standard all read `.agents/skills/`, so they share a copy.
const AGENT_SKILLS_DIRS = {
  claude: ['.claude', 'skills'],
  codex: ['.agents', 'skills'],
  opencode: ['.agents', 'skills'],
  agents: ['.agents', 'skills'],
} as const;

type Agent = keyof typeof AGENT_SKILLS_DIRS;
type InstallResult = 'created' | 'updated' | 'unchanged';

const AGENTS = Object.keys(AGENT_SKILLS_DIRS) as Agent[];
const isAgent = (name: string): name is Agent => (AGENTS as string[]).includes(name);

export const skillCommand: CommandHandler = (args, ctx) => {
  const sub = args.positionals[1];
  switch (sub) {
    case 'install':
      return skillInstall(args, ctx);
    default:
      throw new CliError('USAGE', `Unknown skill subcommand "${sub ?? ''}". Use: install.`, 2);
  }
};

async function skillInstall(args: ParsedArgs, ctx: CommandContext): Promise<CommandOutput> {
  const names = args.positionals.slice(2);
  if (names.length === 0) {
    throw new CliError('USAGE', `Name the agents to install the skill for: ${AGENTS.join(' | ')}.`, 2);
  }
  const agents: Agent[] = [];
  for (const name of names) {
    if (!isAgent(name)) {
      throw new CliError('USAGE', `Unknown agent "${name}". Use: ${AGENTS.join(' | ')}.`, 2);
    }
    if (!agents.includes(name)) agents.push(name);
  }

  const global = flagBool(args.flags, 'global');
  if (global && ctx.dataDir !== undefined) {
    throw new CliError('USAGE', '--global installs under the home directory; drop --data-dir.', 2);
  }
  const root = global ? homedir() : await projectRoot(ctx);

  // Agents sharing a directory share the file: it is written once, and each of
  // them reports what the file was before this call.
  const byPath = new Map<string, InstallResult>();
  const installed: { agent: Agent; path: string; result: InstallResult }[] = [];
  for (const agent of agents) {
    const path = join(root, ...AGENT_SKILLS_DIRS[agent], SKILL_NAME, 'SKILL.md');
    let result = byPath.get(path);
    if (result === undefined) {
      result = await installFile(path);
      byPath.set(path, result);
    }
    installed.push({ agent, path, result });
  }

  return {
    data: { skill: SKILL_NAME, installed },
    human: installed.map((row) => `${row.agent} → ${row.path} (${row.result})`).join('\n'),
  };
}

// The project is the folder holding the board. The config goes through the same
// gate `schema` uses, so a too-new or unreadable board is refused here as well.
async function projectRoot(ctx: CommandContext): Promise<string> {
  const boardRoot = await resolveBoardRoot(ctx.cwd, ctx.dataDir);
  if ((await loadConfigIfAny(ctx.cwd, ctx.dataDir)) === null) {
    throw new CliError('NO_BOARD', `No board config in ${boardRoot}. Run \`boardown init\` first.`);
  }
  return dirname(boardRoot);
}

async function installFile(path: string): Promise<InstallResult> {
  const wanted = Buffer.from(skillText, 'utf8');
  let existing: Buffer | null = null;
  try {
    existing = await readFile(path);
  } catch (err) {
    if (!isENOENT(err)) throw err;
  }
  if (existing?.equals(wanted) === true) return 'unchanged';
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, wanted);
  return existing === null ? 'created' : 'updated';
}
