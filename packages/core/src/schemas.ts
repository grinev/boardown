import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;
export const TASK_TYPES = ['bug', 'feature', 'docs', 'tech'] as const;
// Heaviest first: every list built by mapping over this reads top-down.
export const TASK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const RELEASE_STATUSES = ['future', 'current', 'finished'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium';

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

// Authoring order: the symmetric relation, then each directed pair. It carries no
// product meaning — the order the task dialog groups its links in is a display rule
// and lives with the grouping code.
export const LINK_TYPES = [
  'relates',
  'blocks',
  'blocked-by',
  'duplicates',
  'duplicated-by',
  'includes',
  'part-of',
] as const;
export type LinkType = (typeof LINK_TYPES)[number];

// A link is stored on both tasks. `inverse` is the type the mirrored record
// carries on the other side, so an asymmetric type (blocks / blocked-by) is one
// more entry here rather than a branch anywhere else. `label` is how the relation
// reads from the side that holds the record.
export const LINK_TYPE_META: Record<LinkType, { label: string; inverse: LinkType }> = {
  relates: { label: 'relates to', inverse: 'relates' },
  blocks: { label: 'blocks', inverse: 'blocked-by' },
  'blocked-by': { label: 'is blocked by', inverse: 'blocks' },
  duplicates: { label: 'duplicates', inverse: 'duplicated-by' },
  'duplicated-by': { label: 'is duplicated by', inverse: 'duplicates' },
  includes: { label: 'includes', inverse: 'part-of' },
  'part-of': { label: 'is part of', inverse: 'includes' },
};

// What a surface links with when the user names no relation. The board ops take
// the relation as a required argument; this is the product's fallback, in one place
// so the dialog and the CLI cannot disagree about it.
export const DEFAULT_LINK_TYPE: LinkType = 'relates';

export const TaskLinkSchema = z.object({
  type: z.enum(LINK_TYPES),
  to: z.string().min(1),
});
export type TaskLink = z.infer<typeof TaskLinkSchema>;

export const TaskFrontmatterSchema = z.object({
  id: z.string().min(1),
  type: z.enum(TASK_TYPES),
  // Optional rather than defaulted: a zod default would erase the difference
  // between "absent" and "explicitly medium" at parse time, and the serializer
  // would then write the key into every task it touches.
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES),
  epic: z.string().min(1).optional(),
  order: z.number().int(),
  checklist: z.array(ChecklistItemSchema).optional(),
  notes: z.array(NoteSchema).optional(),
  links: z.array(TaskLinkSchema).optional(),
});

// Custom field values live flat in the file, next to the keys above, but as a
// named bag in memory — so this type is not part of the on-disk schema.
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema> & {
  custom?: Record<string, string>;
};

// An absent `priority` means the default. Every reader — cards, rows, filters,
// CLI summaries — resolves it here, so the default lives in exactly one place.
export const effectiveTaskPriority = (fm: TaskFrontmatter): TaskPriority =>
  fm.priority ?? DEFAULT_TASK_PRIORITY;

export const TaskSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  frontmatter: TaskFrontmatterSchema,
});
export type Task = Omit<z.infer<typeof TaskSchema>, 'frontmatter'> & {
  frontmatter: TaskFrontmatter;
};

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
export type Release = Omit<z.infer<typeof ReleaseSchema>, 'tasks'> & { tasks: Task[] };

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
export type Epic = Omit<z.infer<typeof EpicSchema>, 'tasks'> & { tasks: Task[] };

export const BacklogFrontmatterSchema = z.object({}).strict();
export type BacklogFrontmatter = z.infer<typeof BacklogFrontmatterSchema>;

export const BacklogSchema = z.object({
  filename: z.string().min(1),
  frontmatter: BacklogFrontmatterSchema,
  preamble: z.string(),
  tasks: z.array(TaskSchema),
});
export type Backlog = Omit<z.infer<typeof BacklogSchema>, 'tasks'> & { tasks: Task[] };

// A doc page's frontmatter is optional in every part: a page authored by hand
// with no frontmatter at all is valid and falls back to its filename slug for
// display, the way a release without `name` falls back to its slug.
export const DocPageFrontmatterSchema = z.object({
  title: z.string().optional(),
});
export type DocPageFrontmatter = z.infer<typeof DocPageFrontmatterSchema>;

export const DocPageSchema = z.object({
  path: z.string().min(1),
  slug: z.string().min(1),
  frontmatter: DocPageFrontmatterSchema,
  body: z.string(),
});
export type DocPage = z.infer<typeof DocPageSchema>;

export const ThemeSchema = z.enum(['light', 'dark']);
export type Theme = z.infer<typeof ThemeSchema>;

export const ID_PREFIX_REGEX = /^[A-Z]{2,5}$/;
export const ID_PREFIX_MESSAGE = 'idPrefix must be 2-5 uppercase letters (A-Z)';

export const CUSTOM_FIELD_TYPES = ['string'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

const CUSTOM_FIELD_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const CUSTOM_FIELD_KEY_MESSAGE =
  'customFields key must start with a letter and hold 1-40 letters, digits, "_" or "-"';

// Values are stored flat next to the built-in task frontmatter keys, so a custom
// key that matched one of them would shadow it.
export const RESERVED_TASK_KEYS = [
  'id',
  'type',
  'priority',
  'status',
  'epic',
  'order',
  'checklist',
  'notes',
  'links',
] as const;

export const CustomFieldSchema = z
  .object({
    key: z.string().regex(CUSTOM_FIELD_KEY_REGEX, CUSTOM_FIELD_KEY_MESSAGE),
    label: z.string().min(1).optional(),
    type: z.enum(CUSTOM_FIELD_TYPES),
  })
  .strict();
export type CustomField = z.infer<typeof CustomFieldSchema>;

const CustomFieldsSchema = z
  .array(CustomFieldSchema)
  .refine(
    (fields) => !fields.some((f) => (RESERVED_TASK_KEYS as readonly string[]).includes(f.key)),
    { message: `customFields key must not be one of: ${RESERVED_TASK_KEYS.join(', ')}` },
  )
  .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length, {
    message: 'customFields keys must be unique',
  });

// The map is keyed by status so limits on other columns need no format change,
// but only the status the product actually enforces is accepted — a `todo` entry
// that did nothing would be a value in the file that lies.
export const WipLimitsSchema = z
  .object({
    'in-progress': z.number().int().positive().optional(),
  })
  .strict();
export type WipLimits = z.infer<typeof WipLimitsSchema>;

export const BoardConfigSchema = z
  .object({
    idPrefix: z.string().regex(ID_PREFIX_REGEX, ID_PREFIX_MESSAGE),
    nextId: z.number().int().nonnegative(),
    projectName: z.string().min(1),
    theme: ThemeSchema.optional(),
    // The slug of the active release the Board shows. Not checked against the
    // releases on disk: a slug that stopped being active resolves away at read
    // time, and failing the whole board over a stale view preference would be
    // out of proportion to what it means.
    boardRelease: z.string().min(1).optional(),
    wipLimits: WipLimitsSchema.optional(),
    multipleActiveReleases: z.boolean().optional(),
    customFields: CustomFieldsSchema.optional(),
  })
  .strict();
export type BoardConfig = z.infer<typeof BoardConfigSchema>;

export const customFieldLabel = (field: CustomField): string => field.label ?? field.key;

// js-yaml turns an unquoted number, boolean or bare date into a non-string; a
// string field means the text the user wrote, so coerce those back. Lists and
// maps are not scalars and fail, which surfaces as a task-scope problem.
const customFieldValue = z.preprocess((value) => {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) {
    const y = value.getUTCFullYear().toString().padStart(4, '0');
    const m = (value.getUTCMonth() + 1).toString().padStart(2, '0');
    const d = value.getUTCDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return value;
}, z.string());

// Unknown keys are stripped, so only declared fields are harvested out of a
// task's raw frontmatter.
export const buildCustomValuesSchema = (
  fields: readonly CustomField[],
): z.ZodType<Record<string, string | undefined>> =>
  z.object(Object.fromEntries(fields.map((f) => [f.key, customFieldValue.optional()])));
