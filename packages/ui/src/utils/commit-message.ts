import { resolveTaskType, type TypeConfig } from '@boardown/core';

export const taskCommitMessage = (
  id: string,
  type: string,
  title: string,
  config?: TypeConfig,
): string =>
  `${resolveTaskType(config, type).commitPrefix}(${id}): ${title.replace(/\s+/g, ' ').trim()}`;
