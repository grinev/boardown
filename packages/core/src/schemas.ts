import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;
export const TASK_TYPES = ['bug', 'feature', 'docs', 'tech'] as const;
export const RELEASE_STATUSES = ['future', 'current', 'finished'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const HEX_COLOR_MESSAGE = 'color must be a 6-digit hex like #1f6feb';

export const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// js-yaml parses an unquoted ISO 8601 timestamp into a Date; coerce it back.
const timestampString = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  return value;
}, z.string().min(1));

export const NoteSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  createdAt: timestampString,
});
export type Note = z.infer<typeof NoteSchema>;

export const LINK_TYPES = ['relates'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

// A link is stored on both tasks. `inverse` is the type the mirrored record
// carries on the other side, so an asymmetric type (blocks / blocked-by) is one
// more entry here rather than a branch anywhere else. `label` is how the relation
// reads from the side that holds the record.
export const LINK_TYPE_META: Record<LinkType, { label: string; inverse: LinkType }> = {
  relates: { label: 'relates to', inverse: 'relates' },
};

export const TaskLinkSchema = z.object({
  type: z.enum(LINK_TYPES),
  to: z.string().min(1),
});
export type TaskLink = z.infer<typeof TaskLinkSchema>;

export const TaskFrontmatterSchema = z.object({
  id: z.string().min(1),
  type: z.enum(TASK_TYPES),
  status: z.enum(TASK_STATUSES),
  epic: z.string().min(1).optional(),
  order: z.number().int(),
  checklist: z.array(ChecklistItemSchema).optional(),
  notes: z.array(NoteSchema).optional(),
  links: z.array(TaskLinkSchema).optional(),
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
  status: z.enum(RELEASE_STATUSES),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
});
export type ReleaseFrontmatter = z.infer<typeof ReleaseFrontmatterSchema>;

export const ReleaseSchema = z.object({
  filename: z.string().min(1),
  slug: z.string().min(1),
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

export const BacklogFrontmatterSchema = z.object({}).strict();
export type BacklogFrontmatter = z.infer<typeof BacklogFrontmatterSchema>;

export const BacklogSchema = z.object({
  filename: z.string().min(1),
  frontmatter: BacklogFrontmatterSchema,
  preamble: z.string(),
  tasks: z.array(TaskSchema),
});
export type Backlog = z.infer<typeof BacklogSchema>;

export const ThemeSchema = z.enum(['light', 'dark']);
export type Theme = z.infer<typeof ThemeSchema>;

export const ID_PREFIX_REGEX = /^[A-Z]{2,5}$/;
export const ID_PREFIX_MESSAGE = 'idPrefix must be 2-5 uppercase letters (A-Z)';

export const BoardConfigSchema = z
  .object({
    idPrefix: z.string().regex(ID_PREFIX_REGEX, ID_PREFIX_MESSAGE),
    nextId: z.number().int().nonnegative(),
    projectName: z.string().min(1),
    theme: ThemeSchema.optional(),
  })
  .strict();
export type BoardConfig = z.infer<typeof BoardConfigSchema>;
