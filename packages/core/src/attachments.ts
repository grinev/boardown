import {
  type Container,
  attachmentsDir,
  BoardOpError,
  isFrozenRelease,
  isForbiddenFilenameChar,
  isWindowsReservedName,
} from './board-ops.js';
import type { GuardedChange, GuardedFs, GuardedWrite } from './conflicts.js';
import type { BoardConfig, Task } from './schemas.js';
import type { FsAdapter } from './fs-adapter.js';
import { serializeBacklog, serializeRelease } from './serializer.js';
import { currentMoment, withUpdatedAt } from './task-dates.js';

// GitHub's own cap for an issue attachment: a file in git stays in its history
// for good, so the board keeps what it takes to what a repo can reasonably hold.
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export interface Attachment {
  name: string;
  size: number;
  // Board-relative, like every FsAdapter path.
  path: string;
}

export interface NewAttachment {
  name: string;
  content: Uint8Array;
}

export class AttachmentTooLargeError extends Error {
  readonly fileName: string;
  constructor(fileName: string) {
    super(`"${fileName}" is over 25 MB and was not added`);
    this.name = 'AttachmentTooLargeError';
    this.fileName = fileName;
  }
}

// The path the project-file reader and a `[[repo:…]]` token use for the file:
// every shell roots the board at `.boardown/` inside the project folder.
export const attachmentProjectPath = (taskId: string, name: string): string =>
  `.boardown/${attachmentsDir(taskId)}/${name}`;

// A name every OS the board travels to through git can hold, in one Unicode form
// so the same name is the same file on macOS (which hands over NFD) and Linux.
export const storedAttachmentName = (raw: string): string => {
  let out = '';
  for (const ch of raw.normalize('NFC')) out += isForbiddenFilenameChar(ch) ? '_' : ch;
  out = out.replace(/[. ]+$/, '');
  if (out.length === 0) return 'file';
  const dot = out.indexOf('.');
  const stem = dot === -1 ? out : out.slice(0, dot);
  return isWindowsReservedName(stem) ? `${stem}_${out.slice(stem.length)}` : out;
};

const splitExtension = (name: string): [string, string] => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? [name, ''] : [name.slice(0, dot), name.slice(dot)];
};

// Stored names for `names`, in order, never one already `taken` nor one given to
// an earlier name of the same set. Compared regardless of case: two names that
// differ only in case are one file on Windows and macOS.
export const pickAttachmentNames = (
  names: readonly string[],
  taken: readonly string[],
): string[] => {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  return names.map((raw) => {
    const name = storedAttachmentName(raw);
    let candidate = name;
    const [base, ext] = splitExtension(name);
    for (let n = 1; used.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
};

const fileNames = async (fs: FsAdapter, taskId: string): Promise<string[]> =>
  (await fs.list(attachmentsDir(taskId))).filter((e) => !e.isDirectory).map((e) => e.name);

// What the task's folder holds right now: files only, a subfolder is not an
// attachment. Nothing about attachments is recorded anywhere else.
export const listAttachments = async (fs: FsAdapter, taskId: string): Promise<Attachment[]> => {
  const attachments: Attachment[] = [];
  for (const name of await fileNames(fs, taskId)) {
    const path = `${attachmentsDir(taskId)}/${name}`;
    const stat = await fs.stat(path);
    if (stat !== null) attachments.push({ name, size: stat.size, path });
  }
  return attachments.sort(
    (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name),
  );
};

export const refuseOversizedAttachment = (name: string, size: number): void => {
  if (size > ATTACHMENT_MAX_BYTES) throw new AttachmentTooLargeError(name);
};

// The create-only writes that land `files` in the task's folder, and the names
// they are stored under. Nothing is written here: a new task's files ride the
// same commit as the task itself.
export const attachmentWrites = async (
  fs: FsAdapter,
  taskId: string,
  files: readonly NewAttachment[],
): Promise<{ writes: GuardedWrite[]; names: string[] }> => {
  for (const file of files) refuseOversizedAttachment(file.name, file.content.byteLength);
  const names = pickAttachmentNames(
    files.map((f) => f.name),
    await fileNames(fs, taskId),
  );
  const writes = files.map((file, i) => ({
    path: `${attachmentsDir(taskId)}/${names[i]}`,
    content: file.content,
    createOnly: true,
  }));
  return { writes, names };
};

// How a caller lands a change: through its own fs, so its minVersion stamp rides
// along. It is handed the task as the change stamps it, so a shell holding the
// board in memory can carry the stamp before the disk answers — an edit made
// while the bytes upload then writes it too, instead of writing it away.
export type CommitChange = (change: GuardedChange, task: Task) => Promise<void>;

const refuseIfArchived = (container: Container, config: BoardConfig): void => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot change the attachments of a task in a finished release');
  }
};

// A change to a task's files is a change to the task: its own file is rewritten
// with `updatedAt` stamped, so it is refused exactly as an edit would be — a file
// that did not load whole, or one changed on disk since. It is written with
// tracking off too, unchanged then, so the refusals do not depend on the setting.
const stampedTaskFile = <C extends Container>(
  container: C,
  config: BoardConfig,
  taskId: string,
  now: string,
): { container: C; task: Task; write: GuardedWrite } => {
  const task = container.tasks.find((t) => t.frontmatter.id === taskId);
  if (task === undefined) throw new Error(`Task not found: ${taskId}`);
  const stamped = withUpdatedAt(task, config, now);
  const next: C = {
    ...container,
    tasks: container.tasks.map((t) => (t === task ? stamped : t)),
  };
  // The backlog is the one container without a slug.
  const content = 'slug' in next ? serializeRelease(next) : serializeBacklog(next);
  return { container: next, task: stamped, write: { path: next.filename, content } };
};

// Where the task stands, asked for again once the folder has been read: the task's
// file is written whole, so it must be built from the board as it is by then, not
// as it was when the call began — a shell may have landed an edit meanwhile.
export type LocateTask<C extends Container> = () => { container: C; config: BoardConfig };

// Adds files to a task already on the board. The task's file goes first in the
// change, so it lands right after the checks rather than behind the bytes. The
// container comes back with the task stamped.
export const addAttachments = async <C extends Container>(
  fs: FsAdapter,
  commit: CommitChange,
  locate: LocateTask<C>,
  taskId: string,
  files: readonly NewAttachment[],
  now: string = currentMoment(),
): Promise<{ names: string[]; container: C }> => {
  const before = locate();
  refuseIfArchived(before.container, before.config);
  const { writes, names } = await attachmentWrites(fs, taskId, files);
  const { container, config } = locate();
  refuseIfArchived(container, config);
  const task = stampedTaskFile(container, config, taskId, now);
  await commit({ writes: [task.write, ...writes], removes: [] }, task.task);
  return { names, container: task.container };
};

// Null when the folder holds no such file — already gone, or never there — and
// then nothing is written. Otherwise the stamped container, as for an add. The
// folder goes when its last file does.
export const removeAttachment = async <C extends Container>(
  fs: GuardedFs,
  commit: CommitChange,
  locate: LocateTask<C>,
  taskId: string,
  name: string,
  now: string = currentMoment(),
): Promise<C | null> => {
  const before = locate();
  refuseIfArchived(before.container, before.config);
  if (!(await fileNames(fs, taskId)).includes(name)) return null;
  const { container, config } = locate();
  refuseIfArchived(container, config);
  const dir = attachmentsDir(taskId);
  const task = stampedTaskFile(container, config, taskId, now);
  await commit(
    { writes: [task.write], removes: [], unversionedRemoves: [`${dir}/${name}`] },
    task.task,
  );
  if ((await fs.list(dir)).length === 0) await fs.removeDir(dir);
  return task.container;
};

// Null when the file is gone.
export const readAttachment = async (
  fs: FsAdapter,
  taskId: string,
  name: string,
): Promise<Uint8Array | null> => {
  const path = `${attachmentsDir(taskId)}/${name}`;
  if ((await fs.stat(path)) === null) return null;
  return fs.readBytes(path);
};
