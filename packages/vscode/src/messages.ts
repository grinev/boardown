export type FsMethod = 'read' | 'write' | 'list' | 'stat' | 'mkdir' | 'remove';

export interface FsRequestMessage {
  type: 'fs-request';
  id: number;
  method: FsMethod;
  path: string;
  content?: string;
}

export interface FsResponseMessage {
  type: 'fs-response';
  id: number;
  ok: boolean;
  result?: unknown;
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

export type WebviewToHost = FsRequestMessage | ReadyMessage;
export type HostToWebview = FsResponseMessage | BoardChangedMessage;
