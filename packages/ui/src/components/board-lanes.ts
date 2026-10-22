import {
  TASK_TYPES,
  type BoardSwimlanes,
  type Epic,
  type Task,
  type TypeConfig,
} from '@boardown/core';

export type BoardLane =
  | { key: string; kind: 'epic'; epic: Epic; tasks: Task[] }
  | { key: string; kind: 'no-epic'; tasks: Task[] }
  | { key: string; kind: 'type'; type: string; tasks: Task[] };

const NO_EPIC_LANE = 'no-epic';
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// The lanes of the shown release, each holding at least one task. A task whose
// epic names no epic file has no badge on its card, so it sits in "No epic".
export const boardLanes = (
  tasks: readonly Task[],
  grouping: BoardSwimlanes,
  epics: readonly Epic[],
  config: TypeConfig,
): BoardLane[] =>
  grouping === 'epic' ? epicLanes(tasks, epics) : typeLanes(tasks, config);

const epicLanes = (tasks: readonly Task[], epics: readonly Epic[]): BoardLane[] => {
  const bySlug = new Map(epics.map((epic) => [epic.slug, epic]));
  const grouped = new Map<string, Task[]>();
  const loose: Task[] = [];
  for (const task of tasks) {
    const slug = task.frontmatter.epic;
    if (slug === undefined || !bySlug.has(slug)) {
      loose.push(task);
      continue;
    }
    const list = grouped.get(slug);
    if (list === undefined) grouped.set(slug, [task]);
    else list.push(task);
  }
  const lanes: BoardLane[] = [...grouped]
    .flatMap(([slug, laneTasks]) => {
      const epic = bySlug.get(slug);
      return epic === undefined
        ? []
        : [{ key: `epic:${slug}`, kind: 'epic' as const, epic, tasks: laneTasks }];
    })
    .sort(
      (a, b) =>
        a.epic.frontmatter.name.localeCompare(b.epic.frontmatter.name) ||
        byCodeUnit(a.epic.slug, b.epic.slug),
    );
  if (loose.length > 0) lanes.push({ key: NO_EPIC_LANE, kind: 'no-epic', tasks: loose });
  return lanes;
};

// The type pickers' order — base types, then the board's own — except that a
// disabled base type keeps its place, and an undeclared type follows by key.
const typeLanes = (tasks: readonly Task[], config: TypeConfig): BoardLane[] => {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    const type = task.frontmatter.type;
    const list = grouped.get(type);
    if (list === undefined) grouped.set(type, [task]);
    else list.push(task);
  }
  const declared: string[] = [
    ...TASK_TYPES,
    ...(config?.customTaskTypes ?? []).map((custom) => custom.key),
  ];
  const undeclared = [...grouped.keys()].filter((key) => !declared.includes(key)).sort(byCodeUnit);
  return [...declared, ...undeclared].flatMap((type) => {
    const laneTasks = grouped.get(type);
    return laneTasks === undefined
      ? []
      : [{ key: `type:${type}`, kind: 'type' as const, type, tasks: laneTasks }];
  });
};
