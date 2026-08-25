import type { Server } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { createBoardownServer, LOOPBACK_HOST } from './http-server.js';
import { UsageError, parseArgs, resolveMode } from './options.js';

const listen = (server: Server, port: number): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK_HOST, () => {
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    });
  });

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const run = async (argv: readonly string[]): Promise<void> => {
  const args = parseArgs(argv);
  const { mode, registry, singleRoots } = await resolveMode(args, process.cwd());

  const server = createBoardownServer({
    mode,
    clientDir: path.join(__dirname, 'client'),
  });
  const port = await listen(server, args.port ?? 0);
  const origin = `http://${LOOPBACK_HOST}:${port}`;

  out(`boardown-web  ${origin}`);
  if (singleRoots !== null) {
    out(`  board  ${singleRoots.boardRoot}`);
    return;
  }
  if (registry === null) return;
  out(`  registry  ${registry.filePath}`);
  for (const entry of (await registry.read()).entries) {
    out(`  ${origin}/b/${entry.id}/  ${entry.projectRoot}`);
  }
};

const main = async (): Promise<void> => {
  try {
    await run(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = err instanceof UsageError ? 2 : 1;
  }
};

void main();
