export type FsMethod =
  | 'read'
  | 'write'
  | 'readBytes'
  | 'writeBytes'
  | 'list'
  | 'stat'
  | 'mkdir'
  | 'remove';

// Bytes (readBytes' result, writeBytes' content) cross the channel as a typed
// array, which the webview messaging carries as bytes — never re-encoded.
export interface FsRequestMessage {
  type: 'fs-request';
  id: number;
  method: FsMethod;
  path: string;
  content?: string | Uint8Array;
}

export interface FsResponseMessage {
  type: 'fs-response';
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// Reading a file from the workspace folder for a repo file link. A separate
// message rather than an FsMethod: it is read-only and resolved against the
// workspace folder, while every fs-request stays inside .boardown/.
export interface ProjectFileRequestMessage {
  type: 'project-file-request';
  id: number;
  path: string;
}

export interface ProjectFileResponseMessage {
  type: 'project-file-response';
  id: number;
  // A ProjectFileRead from @boardown/core: the host classified the bytes, and
  // only an image's come along with the result.
  result: unknown;
}

// Reading the local Git history for one task's related commits. A separate
// message for the same reason as the one above: read-only, and resolved against
// the workspace folder rather than .boardown/.
export interface GitCommitsRequestMessage {
  type: 'git-commits-request';
  id: number;
  taskId: string;
}

export interface GitCommitsResponseMessage {
  type: 'git-commits-response';
  id: number;
  // A GitHistoryResult from @boardown/core: the host ran git, core classified
  // what came back, and this channel carries only the JSON of that decision.
  result: unknown;
}

// Download: the host asks the user where to put a copy and writes it there. The
// one write outside .boardown/, and only to a place the user picked.
export interface SaveFileRequestMessage {
  type: 'save-file-request';
  id: number;
  name: string;
  content: Uint8Array;
}

export interface SaveFileResponseMessage {
  type: 'save-file-response';
  id: number;
  ok: boolean;
  error?: string;
}

export interface ReadyMessage {
  type: 'ready';
}

// Pushed host→webview when .boardown/ changed on disk outside the webview, so
// the board can refresh itself. Unlike FsResponseMessage it carries no id — it
// is not a reply to a request but an unsolicited notification.
export interface BoardChangedMessage {
  type: 'board-changed';
}

export type WebviewToHost =
  | FsRequestMessage
  | ProjectFileRequestMessage
  | GitCommitsRequestMessage
  | SaveFileRequestMessage
  | ReadyMessage;
export type HostToWebview =
  | FsResponseMessage
  | ProjectFileResponseMessage
  | GitCommitsResponseMessage
  | SaveFileResponseMessage
  | BoardChangedMessage;
