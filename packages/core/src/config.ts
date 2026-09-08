import yaml from 'js-yaml';
import { fileProblem, type ParseResult } from './problems.js';
import { type BoardConfig, BoardConfigSchema } from './schemas.js';

export const CONFIG_FILENAME = 'config.yaml';

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
