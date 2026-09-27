import {
  type Container,
  attachmentsDir,
  BoardOpError,
  isFrozenRelease,
  isForbiddenFilenameChar,
  isWindowsReservedName,
} from './board-ops.js';
import type { GuardedChange, GuardedFs, GuardedWrite } from './conflicts.js';
import type { BoardConfig } from './schemas.js';
import type { FsAdapter } from './fs-adapter.js';

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
// along.
export type CommitChange = (change: GuardedChange) => Promise<void>;

const refuseIfArchived = (container: Container, config: BoardConfig): void => {
  if (isFrozenRelease(container, config)) {
    throw new BoardOpError('ARCHIVED', 'Cannot change the attachments of a task in a finished release');
  }
};

// Adds files to a task already on the board. The task's own file is not written,
// but it must be unchanged since load: the finished-release rule was read from it.
export const addAttachments = async (
  fs: FsAdapter,
  commit: CommitChange,
  container: Container,
  config: BoardConfig,
  taskId: string,
  files: readonly NewAttachment[],
): Promise<string[]> => {
  refuseIfArchived(container, config);
  const { writes, names } = await attachmentWrites(fs, taskId, files);
  await commit({ writes, removes: [], unchanged: [container.filename] });
  return names;
};

// False when the folder holds no such file — already gone, or never there —
// and then nothing is written. The folder goes when its last file does.
export const removeAttachment = async (
  fs: GuardedFs,
  commit: CommitChange,
  container: Container,
  config: BoardConfig,
  taskId: string,
  name: string,
): Promise<boolean> => {
  refuseIfArchived(container, config);
  if (!(await fileNames(fs, taskId)).includes(name)) return false;
  const dir = attachmentsDir(taskId);
  await commit({
    writes: [],
    removes: [],
    unversionedRemoves: [`${dir}/${name}`],
    unchanged: [container.filename],
  });
  if ((await fs.list(dir)).length === 0) await fs.removeDir(dir);
  return true;
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
