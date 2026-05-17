import type { Active, Over } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Task } from '@boardown/core';
import {
  isSectionDropId,
  isTaskDragId,
  parseSectionDropId,
  parseTaskDragId,
} from './ids';

export const BACKLOG_SECTION_KEY = 'backlog';

export type SectionBuckets = Map<string, Task[]>;

const findSectionOf = (
  buckets: SectionBuckets,
  taskId: string,
): string | null => {
  for (const [key, tasks] of buckets) {
    if (tasks.some((t) => t.frontmatter.id === taskId)) return key;
  }
  return null;
};

export const applyDragOverBacklog = (
  active: Active,
  over: Over,
  buckets: SectionBuckets,
): SectionBuckets => {
  const activeId = String(active.id);
  const overId = String(over.id);
  if (!isTaskDragId(activeId)) return buckets;
  if (activeId === overId) return buckets;
  const taskId = parseTaskDragId(activeId);

  const activeSection = findSectionOf(buckets, taskId);
  if (activeSection === null) return buckets;

  let targetSection: string;
  let overTaskId: string | null;

  if (isTaskDragId(overId)) {
    overTaskId = parseTaskDragId(overId);
    const section = findSectionOf(buckets, overTaskId);
    if (section === null) return buckets;
    targetSection = section;
  } else if (isSectionDropId(overId)) {
    targetSection = parseSectionDropId(overId);
    overTaskId = null;
  } else {
    return buckets;
  }

  if (targetSection === activeSection) {
    if (targetSection === BACKLOG_SECTION_KEY) return buckets;
    if (overTaskId === null) return buckets;
    const tasks = buckets.get(activeSection) ?? [];
    const fromIdx = tasks.findIndex((t) => t.frontmatter.id === taskId);
    const toIdx = tasks.findIndex((t) => t.frontmatter.id === overTaskId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return buckets;
    const next = new Map(buckets);
    next.set(activeSection, arrayMove(tasks, fromIdx, toIdx));
    return next;
  }

  const sourceTasks = buckets.get(activeSection) ?? [];
  const activeTask = sourceTasks.find((t) => t.frontmatter.id === taskId);
  if (!activeTask) return buckets;

  const next = new Map(buckets);
  next.set(
    activeSection,
    sourceTasks.filter((t) => t.frontmatter.id !== taskId),
  );

  const destTasks = [...(buckets.get(targetSection) ?? [])];
  if (overTaskId === null || targetSection === BACKLOG_SECTION_KEY) {
    destTasks.push(activeTask);
  } else {
    const idx = destTasks.findIndex((t) => t.frontmatter.id === overTaskId);
    if (idx === -1) destTasks.push(activeTask);
    else destTasks.splice(idx, 0, activeTask);
  }
  next.set(targetSection, destTasks);

  return next;
};

export interface BacklogPlacement {
  sectionKey: string;
  beforeTaskId: string | null;
}

export const findBacklogPlacement = (
  buckets: SectionBuckets,
  taskId: string,
): BacklogPlacement | null => {
  for (const [key, tasks] of buckets) {
    const idx = tasks.findIndex((t) => t.frontmatter.id === taskId);
    if (idx === -1) continue;
    if (key === BACKLOG_SECTION_KEY) {
      return { sectionKey: key, beforeTaskId: null };
    }
    return {
      sectionKey: key,
      beforeTaskId: tasks[idx + 1]?.frontmatter.id ?? null,
    };
  }
  return null;
};
