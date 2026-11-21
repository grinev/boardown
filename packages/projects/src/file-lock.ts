import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { errorCode, readOptional, removeTransient, replaceText } from './files.js';

const CLAIM = /^([1-9]\d*)-[a-f0-9-]+\.claim$/;

function processExited(pid: number): boolean {
  if (pid === process.pid || pid > 0x7fffffff) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return errorCode(error) === 'ESRCH';
  }
}

// Bakery tickets avoid the race in removing a fixed lock path after its owner
// exits: another process might already own that name. Each attempt has a new name.
export async function withFileLock<T>(file: string, run: () => Promise<T>): Promise<T> {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.lock-`;
  const own = `${prefix}${process.pid}-${randomUUID()}.claim`;
  const claimPath = path.join(dir, own);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(claimPath, '', { flag: 'wx' });

  const readClaims = async (): Promise<Array<{ name: string; ticket: number }>> => {
    const claims: Array<{ name: string; ticket: number }> = [];
    for (const name of await fs.readdir(dir)) {
      if (!name.startsWith(prefix) || name === own) continue;
      const match = CLAIM.exec(name.slice(prefix.length));
      if (match === null) continue;
      const other = path.join(dir, name);
      if (processExited(Number(match[1]))) {
        await removeTransient(other);
        continue;
      }
      const text = await readOptional(other);
      if (text === null) continue;
      const ticket = Number(text); // Empty announces that a ticket is still being chosen.
      if (!Number.isSafeInteger(ticket) || ticket < 0)
        throw new Error(`Invalid lock claim for ${file}`);
      claims.push({ name, ticket });
    }
    return claims;
  };

  try {
    const ticket = (await readClaims()).reduce((max, claim) => Math.max(max, claim.ticket), 0) + 1;
    await replaceText(claimPath, String(ticket));
    const deadline = performance.now() + 8000;
    for (;;) {
      const claims = await readClaims();
      const waiting = claims.some(
        (claim) =>
          claim.ticket === 0 ||
          claim.ticket < ticket ||
          (claim.ticket === ticket && claim.name < own),
      );
      if (!waiting) return await run();
      if (performance.now() >= deadline) throw new Error(`Timed out waiting to update ${file}`);
      await delay(25);
    }
  } finally {
    await removeTransient(claimPath);
  }
}
