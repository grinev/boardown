import {
  BASE_TASK_TYPE_META,
  DEFAULT_TASK_TYPE,
  FALLBACK_TYPE_COLOR,
  FALLBACK_TYPE_ICON,
  TASK_TYPES,
  type BaseTaskType,
  type BoardConfig,
  type CustomTaskType,
  type TaskType,
} from './schemas.js';

export type TypeConfig =
  | {
      readonly taskTypes?: BoardConfig['taskTypes'];
      readonly customTaskTypes?: BoardConfig['customTaskTypes'];
    }
  | null
  | undefined;

export interface ResolvedTaskType {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
  readonly commitPrefix: string;
  readonly enabled: boolean;
}

const isBaseTaskType = (key: string): key is BaseTaskType =>
  (TASK_TYPES as readonly string[]).includes(key);

const prettifyKey = (key: string): string => {
  const normalized = key.replace(/[-_]+/g, ' ').trim();
  if (normalized.length === 0) return key;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};

const overrideFor = (config: TypeConfig, key: BaseTaskType) =>
  config?.taskTypes?.find((entry) => entry.key === key);

const isBaseEnabled = (config: TypeConfig, key: BaseTaskType): boolean => {
  const override = overrideFor(config, key);
  return override === undefined ? true : !override.disabled;
};

const resolveCustom = (entry: CustomTaskType): ResolvedTaskType => ({
  key: entry.key,
  label: entry.label ?? prettifyKey(entry.key),
  icon: entry.icon ?? FALLBACK_TYPE_ICON,
  color: entry.color ?? FALLBACK_TYPE_COLOR,
  commitPrefix: entry.commitPrefix ?? entry.key,
  enabled: true,
});

const resolveBase = (key: BaseTaskType, enabled: boolean): ResolvedTaskType => {
  const meta = BASE_TASK_TYPE_META[key];
  return { key, ...meta, enabled };
};

export const enabledTaskTypes = (config: TypeConfig): readonly ResolvedTaskType[] => {
  const base = TASK_TYPES.filter((key) => isBaseEnabled(config, key)).map((key) =>
    resolveBase(key, true),
  );
  const custom = (config?.customTaskTypes ?? []).map(resolveCustom);
  return [...base, ...custom];
};

export const enabledTaskTypeKeys = (config: TypeConfig): readonly TaskType[] =>
  enabledTaskTypes(config).map((t) => t.key);

export const isEnabledTaskType = (config: TypeConfig, type: TaskType): boolean =>
  enabledTaskTypeKeys(config).includes(type);

export const defaultTaskType = (config: TypeConfig): TaskType => {
  if (isEnabledTaskType(config, DEFAULT_TASK_TYPE)) return DEFAULT_TASK_TYPE;
  const first = enabledTaskTypes(config)[0];
  if (first === undefined) throw new Error('The board declares no task types');
  return first.key;
};

export const resolveTaskType = (config: TypeConfig, type: TaskType): ResolvedTaskType => {
  if (isBaseTaskType(type)) return resolveBase(type, isBaseEnabled(config, type));
  const custom = config?.customTaskTypes?.find((entry) => entry.key === type);
  if (custom !== undefined) return resolveCustom(custom);
  return {
    key: type,
    label: type,
    icon: FALLBACK_TYPE_ICON,
    color: FALLBACK_TYPE_COLOR,
    commitPrefix: type,
    enabled: false,
  };
};
