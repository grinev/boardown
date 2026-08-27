import { describe, expect, it } from 'vitest';
import { taskCommitMessage } from './commit-message';

describe('taskCommitMessage', () => {
  it('spells each board type the way a conventional commit does', () => {
    expect(taskCommitMessage('BD-1', 'feature', 'Add next button')).toBe(
      'feat(BD-1): Add next button',
    );
    expect(taskCommitMessage('BD-2', 'bug', 'Crash on empty title')).toBe(
      'fix(BD-2): Crash on empty title',
    );
    expect(taskCommitMessage('BD-3', 'docs', 'Document the CLI')).toBe(
      'docs(BD-3): Document the CLI',
    );
    expect(taskCommitMessage('BD-4', 'tech', 'Drop the shim')).toBe('chore(BD-4): Drop the shim');
  });

  it('takes the id and the title as they are on the board', () => {
    expect(taskCommitMessage('TS-7', 'feature', 'add CSV export.')).toBe(
      'feat(TS-7): add CSV export.',
    );
    expect(taskCommitMessage('BD-9', 'bug', 'Fix (again): «сортировка» — 2/3')).toBe(
      'fix(BD-9): Fix (again): «сортировка» — 2/3',
    );
  });

  it('flattens a title that spans lines or repeats whitespace', () => {
    expect(taskCommitMessage('BD-5', 'feature', 'Add   a\nsecond\tline')).toBe(
      'feat(BD-5): Add a second line',
    );
    expect(taskCommitMessage('BD-6', 'feature', '  padded  ')).toBe('feat(BD-6): padded');
  });

  it('leaves the bare prefix for a title that is empty or only whitespace', () => {
    expect(taskCommitMessage('BD-7', 'tech', '')).toBe('chore(BD-7): ');
    expect(taskCommitMessage('BD-8', 'tech', '   \n ')).toBe('chore(BD-8): ');
  });
});
