import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { resolveTaskType, type TypeConfig } from '@boardown/core';
import { lucideIconFromName } from './icons/lucide-by-name';

export interface TaskTypeDisplay {
  icon: LucideIcon;
  label: string;
  style: CSSProperties;
}

export const taskTypeDisplay = (config: TypeConfig, type: string): TaskTypeDisplay => {
  const resolved = resolveTaskType(config, type);
  return {
    icon: lucideIconFromName(resolved.icon),
    label: resolved.label,
    style: {
      '--type-color': resolved.color,
      color: 'var(--type-color)',
    } as CSSProperties,
  };
};
