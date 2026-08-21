import type { CSSProperties } from 'react';
import {
  boardStatuses,
  statusIndex,
  statusLabel,
  type StatusConfig,
  type TaskStatus,
} from '@boardown/core';
import { formatStatusLabel } from './format-status';

// Status colour is positional, so it cannot be a class map: the first column
// reads the todo pair, the last the done pair, each middle the next numbered
// pair, and a status the board no longer declares the neutral one. The pair is
// handed to CSS as two custom properties, the way an epic's colour already is.
export const statusColorStyle = (config: StatusConfig, status: TaskStatus): CSSProperties => {
  const index = statusIndex(config, status);
  if (index === -1) return varPair('unknown');
  if (index === 0) return varPair('todo');
  if (index === boardStatuses(config).length - 1) return varPair('done');
  return varPair(`mid-${index}`);
};

const varPair = (name: string): CSSProperties =>
  ({
    '--status-bg': `var(--status-${name}-bg)`,
    '--status-fg': `var(--status-${name}-fg)`,
  }) as CSSProperties;

// A declared label wins; otherwise the key is prettified the way it always was.
export const statusDisplayLabel = (config: StatusConfig, status: TaskStatus): string =>
  statusLabel(config, status) ?? formatStatusLabel(status);
