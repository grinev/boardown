import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function readOptional(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

export async function replaceText(file: string, text: string): Promise<void> {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, text, { encoding: 'utf8', flag: 'wx' });
    await retrySharingViolation(() => fs.rename(temp, file));
  } finally {
    await removeTransient(temp);
  }
}

async function retrySharingViolation(action: () => Promise<void>): Promise<void> {
  let wait = 15;
  for (;;) {
    try {
      await action();
      return;
    } catch (error) {
      const code = errorCode(error);
      if (process.platform !== 'win32' || wait > 240 ||
        (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
      // A short-lived reader (including one reading a lock claim) can hold the
      // Windows file open across the atomic replacement.
      await delay(wait);
      wait *= 2;
    }
  }
}

export const removeTransient = (file: string): Promise<void> =>
  retrySharingViolation(() => fs.rm(file, { force: true }));

export async function canonicalPath(file: string): Promise<string> {
  const absolute = path.resolve(file);
  try {
    return await fs.realpath(absolute);
  } catch {
    const parent = path.dirname(absolute);
    if (parent === absolute) return absolute;
    return path.join(await canonicalPath(parent), path.basename(absolute));
  }
}

export const pathKey = (absolute: string): string =>
  process.platform === 'win32' ? absolute.toLowerCase() : absolute;

export const isAbsolutePath = (value: string): boolean => path.isAbsolute(value);
