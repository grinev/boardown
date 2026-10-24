import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { resolveTaskType, type ResolvedTaskType, type TypeConfig } from '@boardown/core';
import { lucideIconFromName } from './icons/lucide-by-name';

export interface TaskTypeDisplay {
  icon: LucideIcon;
  label: string;
  style: CSSProperties;
}

const typeColor = (resolved: ResolvedTaskType): string => {
  switch (resolved.colorSource) {
    case 'base':
      return `var(--type-${resolved.key})`;
    case 'fallback':
      return 'var(--type-fallback)';
    case 'declared':
      return resolved.color;
  }
};

export const taskTypeDisplay = (config: TypeConfig, type: string): TaskTypeDisplay => {
  const resolved = resolveTaskType(config, type);
  return {
    icon: lucideIconFromName(resolved.icon),
    label: resolved.label,
    style: {
      '--type-color': typeColor(resolved),
      color: 'var(--type-color)',
    } as CSSProperties,
  };
};
