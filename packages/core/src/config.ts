import yaml from 'js-yaml';
import packageJson from '../package.json' with { type: 'json' };
import { fileProblem, type ParseResult } from './problems.js';
import { type BoardConfig, BoardConfigSchema, MIN_VERSION_REGEX } from './schemas.js';

export const CONFIG_FILENAME = 'config.yaml';

export const APP_VERSION: string = packageJson.version;
export const MIN_COMPATIBLE_VERSION: string = packageJson.minCompatibleVersion;

export type MinVersionGate =
  | { kind: 'pass' }
  | { kind: 'too-old'; required: string; running: string };

const versionParts = (value: string): [number, number, number] | null => {
  const match = MIN_VERSION_REGEX.exec(value);
  if (!match) return null;
  const [major, minor, patch] = match[0].split('.').map(Number);
  if (major === undefined || minor === undefined || patch === undefined) return null;
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return [major, minor, patch];
};

export const isVersionAtLeast = (running: string, required: string): boolean => {
  const left = versionParts(running);
  const right = versionParts(required);
  if (left === null || right === null) return false;
  for (let i = 0; i < 3; i++) {
    const a = left[i]!;
    const b = right[i]!;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
};

const coerceMinVersion = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

export const checkMinVersion = (
  yamlText: string,
  runningVersion: string = APP_VERSION,
): MinVersionGate => {
  let raw: unknown;
  try {
    raw = yaml.load(yamlText);
  } catch {
    return { kind: 'pass' };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { kind: 'pass' };
  }
  const value = (raw as Record<string, unknown>)['minVersion'];
  if (value === undefined) return { kind: 'pass' };
  const text = coerceMinVersion(value);
  if (text === null || versionParts(text) === null) return { kind: 'pass' };
  if (isVersionAtLeast(runningVersion, text)) return { kind: 'pass' };
  return { kind: 'too-old', required: text, running: runningVersion };
};

export const configNeedsMinVersionStamp = (config: BoardConfig): boolean => {
  const recorded = config.minVersion;
  if (recorded === undefined) return true;
  return !isVersionAtLeast(recorded, MIN_COMPATIBLE_VERSION);
};

export const withMinVersionStamp = (config: BoardConfig): BoardConfig => ({
  ...config,
  minVersion: MIN_COMPATIBLE_VERSION,
});

export const parseConfig = (text: string, filename = CONFIG_FILENAME): ParseResult<BoardConfig> => {
  let raw: unknown;
  try {
    raw = yaml.load(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      value: null,
      problems: [fileProblem(filename, `Invalid config YAML: ${message}`)],
    };
  }
  const result = BoardConfigSchema.safeParse(raw ?? {});
  if (!result.success) {
    return {
      value: null,
      problems: [
        fileProblem(
          filename,
          `Config failed validation: ${result.error.issues.map((i) => i.message).join('; ')}`,
        ),
      ],
    };
  }
  return { value: result.data, problems: [] };
};

export const serializeConfig = (config: BoardConfig): string => {
  const ordered: Record<string, unknown> = {
    minVersion: MIN_COMPATIBLE_VERSION,
    idPrefix: config.idPrefix,
    nextId: config.nextId,
    projectName: config.projectName,
  };
  if (config.theme !== undefined) {
    ordered.theme = config.theme;
  }
  if (config.boardRelease !== undefined) {
    ordered.boardRelease = config.boardRelease;
  }
  const wipLimits = config.wipLimits;
  if (wipLimits !== undefined && wipLimits['in-progress'] !== undefined) {
    ordered.wipLimits = { 'in-progress': wipLimits['in-progress'] };
  }
  if (config.multipleActiveReleases !== undefined) {
    ordered.multipleActiveReleases = config.multipleActiveReleases;
  }
  if (config.gitIntegration !== undefined) {
    ordered.gitIntegration = config.gitIntegration;
  }
  if (config.statusOutsideActiveRelease !== undefined) {
    ordered.statusOutsideActiveRelease = config.statusOutsideActiveRelease;
  }
  if (config.statuses !== undefined) {
    ordered.statuses = config.statuses.map((status) => {
      const entry: Record<string, unknown> = { key: status.key };
      if (status.label !== undefined) entry.label = status.label;
      return entry;
    });
  }
    if (config.customFields !== undefined) {
      ordered.customFields = config.customFields.map((field) => {
        const entry: Record<string, unknown> = { key: field.key };
        if (field.label !== undefined) entry.label = field.label;
        entry.type = field.type;
        return entry;
      });
    }
    if (config.taskTypes !== undefined) {
      ordered.taskTypes = config.taskTypes.map((entry) => ({
        key: entry.key,
        disabled: entry.disabled,
      }));
    }
    if (config.customTaskTypes !== undefined) {
      ordered.customTaskTypes = config.customTaskTypes.map((entry) => {
        const out: Record<string, unknown> = { key: entry.key };
        if (entry.label !== undefined) out.label = entry.label;
        if (entry.icon !== undefined) out.icon = entry.icon;
        if (entry.color !== undefined) out.color = entry.color;
        if (entry.commitPrefix !== undefined) out.commitPrefix = entry.commitPrefix;
        return out;
      });
    }
    return yaml.dump(ordered, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
};
