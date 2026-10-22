import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_COLUMN,
  blockedCells,
  boardCellKey,
  cellLane,
  cellStatus,
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

describe('board cells', () => {
  it('is the bare status when the Board has no lanes', () => {
    expect(boardCellKey(null, 'todo')).toBe('todo');
    expect(cellStatus('todo')).toBe('todo');
    expect(cellLane('todo')).toBeNull();
  });

  it('round-trips lane and status, whatever the lane key holds', () => {
    for (const lane of ['epic:core', 'type:odd\u001ftype', 'type:']) {
      for (const status of ['in-progress', UNKNOWN_COLUMN]) {
        const cell = boardCellKey(lane, status);
        expect(cellLane(cell)).toBe(lane);
        expect(cellStatus(cell)).toBe(status);
      }
    }
  });

  it('blocks every cell of another lane and full columns other than the source', () => {
    const cells = [
      boardCellKey('a', 'todo'),
      boardCellKey('a', 'in-progress'),
      boardCellKey('a', 'review'),
      boardCellKey('b', 'todo'),
      boardCellKey('b', 'in-progress'),
    ];
    const full = new Set(['in-progress', 'review']);
    expect([...blockedCells(cells, boardCellKey('a', 'in-progress'), full)]).toEqual([
      boardCellKey('a', 'review'),
      boardCellKey('b', 'todo'),
      boardCellKey('b', 'in-progress'),
    ]);
  });

  it('blocks only full columns when the Board has no lanes', () => {
    const full = new Set(['in-progress']);
    expect([...blockedCells(['todo', 'in-progress', 'done'], 'todo', full)]).toEqual([
      'in-progress',
    ]);
    expect(blockedCells(['todo', 'in-progress'], 'in-progress', full).size).toBe(0);
  });
});
