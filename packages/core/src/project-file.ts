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

export type ProjectFileRead =
  | { kind: 'text'; text: string }
  // Not a text file: the bytes hold NUL or are not valid UTF-8.
  | { kind: 'binary' }
  | { kind: 'too-large' }
  | { kind: 'not-found' }
  // A directory, a permission error, a path that escapes the project folder.
  | { kind: 'unreadable' };

// Decided over the bytes rather than the extension, so `Dockerfile`, `LICENSE`
// and every extension a project invents are previewable. Hosts call this: the
// UI never sees bytes, since the VS Code webview channel carries JSON only.
export const classifyProjectFile = (bytes: Uint8Array): ProjectFileRead => {
  if (bytes.byteLength > PROJECT_FILE_MAX_BYTES) return { kind: 'too-large' };
  if (bytes.includes(0)) return { kind: 'binary' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { kind: 'binary' };
  }
  return { kind: 'text', text: text.startsWith('﻿') ? text.slice(1) : text };
};

// The shells' second file capability, beside `FsAdapter`: read-only, scoped to
// the project folder instead of `.boardown/`, and never wrapped by the write
// conflict guard. Kept separate on purpose — no write path may reach these paths.
export interface ProjectFileReader {
  readFile(path: string): Promise<ProjectFileRead>;
}
