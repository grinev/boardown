import { ATTACHMENT_MAX_BYTES } from './attachments.js';

// Repo file references: `[[repo:packages/cli/src/node-fs.ts]]`, a pointer at a
// file anywhere in the project folder — the directory that holds `.boardown/`.
// Unlike a doc reference there is nothing to resolve it against: the project is
// not indexed, so a token becomes a link on sight and the read happens on click.
export const REPO_REF_PREFIX = 'repo:';

// A path typed by an agent arrives in whatever shape its platform produced:
// backslashes on Windows, a leading `./`, a leading `/` meaning "from the project
// root". All three are normalized. A leading slash is *not* an OS root — stripping
// it is what keeps `repo:/etc/passwd` a (missing) file inside the project, and a
// UNC prefix collapses the same way for the same reason: inside a reference, a
// path is a project path.
//
// This is normalization, **not** a security check: a `..` segment or a drive
// letter survives it and becomes an ordinary-looking link, which the host then
// refuses when the user clicks. Deciding that here instead would make a bad path
// silently unclickable — and would put the boundary in the renderer, where it
// does not belong. Only a token with no path at all is not a reference.
export const projectFilePathFromRefToken = (token: string): string | null => {
  if (!token.startsWith(REPO_REF_PREFIX)) return null;
  const raw = token.slice(REPO_REF_PREFIX.length).trim().replace(/\\/g, '/');
  const segments = raw.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.length === 0) return null;
  return segments.join('/');
};

// The link's label. Only the file name is shown, however deep the path.
export const projectFileName = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1);

// A preview is a preview: a repo can hold a multi-gigabyte log, and reading one
// into a dialog would freeze the shell.
export const PROJECT_FILE_MAX_BYTES = 1024 * 1024;

// Recognised by name: the browser renders by type, and an attachment row has to
// know before it reads the file.
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

const extensionOf = (path: string): string => {
  const name = projectFileName(path);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
};

// Null for a name that is not an image.
export const imageMimeType = (path: string): string | null =>
  IMAGE_MIME_TYPES[extensionOf(path)] ?? null;

export const isImageFile = (path: string): boolean => imageMimeType(path) !== null;

// An svg is XML, so the content test would always call it text; it is the one
// image format that goes to the browser on its name alone.
export const isSvgFile = (path: string): boolean => extensionOf(path) === 'svg';

// Hosts compare the file's size against this before reading it. An image may be
// as large as an attachment, so nothing the board stores is refused a preview.
export const projectFileMaxBytes = (path: string): number =>
  isImageFile(path) ? ATTACHMENT_MAX_BYTES : PROJECT_FILE_MAX_BYTES;

export type ProjectFileRead =
  | { kind: 'text'; text: string }
  // Whether it actually decodes is the browser's call, made when it is shown.
  | { kind: 'image'; bytes: Uint8Array }
  // Not a text file: the bytes hold NUL or are not valid UTF-8.
  | { kind: 'binary' }
  | { kind: 'too-large' }
  | { kind: 'not-found' }
  // A directory, a permission error, a path that escapes the project folder.
  | { kind: 'unreadable' };

const decodeText = (bytes: Uint8Array): string | null => {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

// Decided over the bytes rather than the extension, so `Dockerfile`, `LICENSE`
// and every extension a project invents are previewable — and a text file named
// like an image still opens as text. Hosts call this, each around its own read.
export const classifyProjectFile = (path: string, bytes: Uint8Array): ProjectFileRead => {
  if (bytes.byteLength > projectFileMaxBytes(path)) return { kind: 'too-large' };
  if (isSvgFile(path)) return { kind: 'image', bytes };
  const text = decodeText(bytes);
  if (text === null) return isImageFile(path) ? { kind: 'image', bytes } : { kind: 'binary' };
  if (bytes.byteLength > PROJECT_FILE_MAX_BYTES) return { kind: 'too-large' };
  return { kind: 'text', text: text.startsWith('﻿') ? text.slice(1) : text };
};

// The shells' second file capability, beside `FsAdapter`: read-only, scoped to
// the project folder instead of `.boardown/`, and never wrapped by the write
// conflict guard. Kept separate on purpose — no write path may reach these paths.
export interface ProjectFileReader {
  readFile(path: string): Promise<ProjectFileRead>;
}
