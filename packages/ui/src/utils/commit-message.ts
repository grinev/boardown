import type { TaskType } from '@boardown/core';

// The board's four types spelled the way a conventional commit spells them. Kept
// apart from TASK_TYPE_META, which is the vocabulary the board *shows*; a commit
// keyword is never on screen. Total over TaskType, so a fifth type added in core
// is a compile error here rather than a silent fallthrough.
const COMMIT_TYPE: Record<TaskType, string> = {
  feature: 'feat',
  bug: 'fix',
  docs: 'docs',
  tech: 'chore',
};

// The subject line of the commit that would close this task. The title is taken
// as it is on the board — no casing change, no truncation — beyond being flattened
// to one line, which only a hand-edited file can need.
export const taskCommitMessage = (id: string, type: TaskType, title: string): string =>
  `${COMMIT_TYPE[type]}(${id}): ${title.replace(/\s+/g, ' ').trim()}`;
