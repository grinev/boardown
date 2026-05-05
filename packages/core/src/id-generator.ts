import type { BoardConfig, Task } from './schemas.js';

export const nextTaskId = (
  config: BoardConfig,
): { id: string; config: BoardConfig } => {
  const id = `${config.idPrefix}-${config.nextId}`;
  return { id, config: { ...config, nextId: config.nextId + 1 } };
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const verifyNextId = (
  config: BoardConfig,
  tasks: readonly Task[],
): { config: BoardConfig; bumped: boolean } => {
  const re = new RegExp(`^${escapeRegex(config.idPrefix)}-(\\d+)$`);
  let maxN = -1;
  for (const task of tasks) {
    const match = re.exec(task.frontmatter.id);
    if (match === null) continue;
    const n = Number.parseInt(match[1]!, 10);
    if (Number.isFinite(n) && n > maxN) maxN = n;
  }
  const required = maxN + 1;
  if (required > config.nextId) {
    return { config: { ...config, nextId: required }, bumped: true };
  }
  return { config, bumped: false };
};
