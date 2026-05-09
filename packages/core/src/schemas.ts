import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;
export const TASK_TYPES = ['bug', 'feature', 'docs', 'tech'] as const;
export const RELEASE_STATUSES = ['future', 'current', 'finished'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_MESSAGE = 'color must be a 6-digit hex like #1f6feb';

export const TaskFrontmatterSchema = z.object({
  id: z.string().min(1),
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  epic: z.string().min(1).optional(),
  order: z.number().int(),
});
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;

export const TaskSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  frontmatter: TaskFrontmatterSchema,
});
export type Task = z.infer<typeof TaskSchema>;

const dateString = z.preprocess((value) => {
  if (value instanceof Date) {
    const y = value.getUTCFullYear().toString().padStart(4, '0');
    const m = (value.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = value.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return value;
}, z.string().min(1));

export const ReleaseFrontmatterSchema = z.object({
  release: z.string().min(1),
  status: z.enum(RELEASE_STATUSES),
  name: z.string().min(1).optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
});
export type ReleaseFrontmatter = z.infer<typeof ReleaseFrontmatterSchema>;

export const ReleaseSchema = z.object({
  filename: z.string().min(1),
  frontmatter: ReleaseFrontmatterSchema,
  preamble: z.string(),
  tasks: z.array(TaskSchema),
});
export type Release = z.infer<typeof ReleaseSchema>;

export const EpicFrontmatterSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(HEX_COLOR_REGEX, HEX_COLOR_MESSAGE),
});
export type EpicFrontmatter = z.infer<typeof EpicFrontmatterSchema>;

export const EpicSchema = z.object({
  filename: z.string().min(1),
  slug: z.string().min(1),
  frontmatter: EpicFrontmatterSchema,
  preamble: z.string(),
  tasks: z.array(TaskSchema),
});
export type Epic = z.infer<typeof EpicSchema>;

export const ThemeSchema = z.enum(['light', 'dark']);
export type Theme = z.infer<typeof ThemeSchema>;

export const BoardConfigSchema = z
  .object({
    idPrefix: z.string().min(1),
    nextId: z.number().int().nonnegative(),
    tasksDir: z.string().min(1).optional(),
    theme: ThemeSchema.optional(),
  })
  .strict();
export type BoardConfig = z.infer<typeof BoardConfigSchema>;
