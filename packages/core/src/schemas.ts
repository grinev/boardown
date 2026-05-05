import { z } from 'zod';

export const TaskFrontmatterSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
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
  slug: z.string().min(1),
  title: z.string().optional(),
});
export type EpicFrontmatter = z.infer<typeof EpicFrontmatterSchema>;

export const EpicSchema = z.object({
  filename: z.string().min(1),
  frontmatter: EpicFrontmatterSchema,
  preamble: z.string(),
  tasks: z.array(TaskSchema),
});
export type Epic = z.infer<typeof EpicSchema>;

export const BoardConfigSchema = z.object({
  idPrefix: z.string().min(1),
  nextId: z.number().int().nonnegative(),
  statuses: z.array(z.string().min(1)).min(1),
  paths: z.object({
    releases: z.string().min(1),
    epics: z.string().min(1),
  }),
});
export type BoardConfig = z.infer<typeof BoardConfigSchema>;
