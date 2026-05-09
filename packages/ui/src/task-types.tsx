import { Bookmark, Bug, FileText, Wrench, type LucideIcon } from 'lucide-react';
import type { TaskType } from '@boardown/core';

interface TaskTypeMeta {
  icon: LucideIcon;
  colorVar: string;
  label: string;
}

export const TASK_TYPE_META: Record<TaskType, TaskTypeMeta> = {
  bug: { icon: Bug, colorVar: 'var(--type-bug)', label: 'Bug' },
  feature: { icon: Bookmark, colorVar: 'var(--type-feature)', label: 'Feature' },
  docs: { icon: FileText, colorVar: 'var(--type-docs)', label: 'Docs' },
  tech: { icon: Wrench, colorVar: 'var(--type-tech)', label: 'Tech' },
};
