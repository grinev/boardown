import { describe, expect, it } from 'vitest';
import {
  columnDropId,
  isColumnDropId,
  isSectionDropId,
  isTaskDragId,
  parseColumnDropId,
  parseSectionDropId,
  parseTaskDragId,
  sectionDropId,
  taskDragId,
} from './ids';

describe('drag/drop id helpers', () => {
  it('round-trips task drag ids', () => {
    const id = taskDragId('BD-12');
    expect(id).toBe('task:BD-12');
    expect(isTaskDragId(id)).toBe(true);
    expect(parseTaskDragId(id)).toBe('BD-12');
  });

  it('round-trips column drop ids', () => {
    const id = columnDropId('in-progress');
    expect(id).toBe('column:in-progress');
    expect(isColumnDropId(id)).toBe(true);
    expect(parseColumnDropId(id)).toBe('in-progress');
  });

  it('round-trips section drop ids', () => {
    const id = sectionDropId('releases/1.0.md');
    expect(id).toBe('section:releases/1.0.md');
    expect(isSectionDropId(id)).toBe(true);
    expect(parseSectionDropId(id)).toBe('releases/1.0.md');
  });

  it('predicates discriminate between id kinds', () => {
    expect(isTaskDragId(columnDropId('todo'))).toBe(false);
    expect(isColumnDropId(taskDragId('BD-1'))).toBe(false);
    expect(isSectionDropId(taskDragId('BD-1'))).toBe(false);
  });
});
