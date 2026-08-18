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
  if (config.customFields !== undefined) {
    ordered.customFields = config.customFields.map((field) => {
      const entry: Record<string, unknown> = { key: field.key };
      if (field.label !== undefined) entry.label = field.label;
      entry.type = field.type;
      return entry;
    });
  }
  return yaml.dump(ordered, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
};
