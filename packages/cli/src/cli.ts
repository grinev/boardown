import { run } from './app';

async function main(): Promise<void> {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

void main();
