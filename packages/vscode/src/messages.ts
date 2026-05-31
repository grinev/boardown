export type FsMethod = 'read' | 'write' | 'list' | 'stat';

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

export type WebviewToHost = FsRequestMessage | ReadyMessage;
export type HostToWebview = FsResponseMessage;
