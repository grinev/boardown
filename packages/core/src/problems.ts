export type ProblemLevel = 'error' | 'warning';
export type ProblemScope = 'file' | 'task';

export interface ParseProblem {
  level: ProblemLevel;
  scope: ProblemScope;
  file: string;
  taskIndex?: number;
  taskId?: string;
  message: string;
}

export interface ParseResult<T> {
  value: T | null;
  problems: ParseProblem[];
}

export const fileProblem = (
  file: string,
  message: string,
  level: ProblemLevel = 'error',
): ParseProblem => ({ level, scope: 'file', file, message });

export const taskProblem = (
  file: string,
  taskIndex: number,
  message: string,
  taskId?: string,
  level: ProblemLevel = 'error',
): ParseProblem => {
  const p: ParseProblem = { level, scope: 'task', file, taskIndex, message };
  if (taskId !== undefined) p.taskId = taskId;
  return p;
};
