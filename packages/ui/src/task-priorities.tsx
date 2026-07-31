import { ChevronDown, ChevronUp, ChevronsUp, Equal, type LucideIcon } from 'lucide-react';
import type { TaskPriority } from '@boardown/core';

interface TaskPriorityMeta {
  icon: LucideIcon;
  colorVar: string;
  label: string;
}

export const TASK_PRIORITY_META: Record<TaskPriority, TaskPriorityMeta> = {
  critical: { icon: ChevronsUp, colorVar: 'var(--priority-critical)', label: 'Critical' },
  high: { icon: ChevronUp, colorVar: 'var(--priority-high)', label: 'High' },
  medium: { icon: Equal, colorVar: 'var(--priority-medium)', label: 'Medium' },
  low: { icon: ChevronDown, colorVar: 'var(--priority-low)', label: 'Low' },
};
