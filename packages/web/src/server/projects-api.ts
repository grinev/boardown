import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '../../../core/src/logger';
import { readJsonBody, sendJson, sendText } from '../api/board-api.js';
import { describeEntries } from './board-list.js';
import { renderProjects } from './list-page.js';
import { addEntry, removeEntry, validateAdd, type Refusal } from './registry-edit.js';
import { parseRegistry, type RegistryEntry, type RegistryFile } from './registry.js';

// The registry's own endpoints. They act on the file the server is running on
// rather than on any board, which is why they sit outside the /b/<id>/ prefix and
// are routed in registry mode only. Everything they touch is the registry: no
// path here ever reaches into a project folder, and removing a project removes
// one line of one file and nothing else.

const log = createLogger('web.projects-api');

export const PROJECTS_ADD = '/api/projects/add';
export const PROJECTS_REMOVE = '/api/projects/remove';

const refuse = (res: ServerResponse, status: number, refusal: Refusal): void => {
  sendJson(res, status, refusal);
};

/** The list as it stands after the write, read back from disk. */
const sendList = async (res: ServerResponse, registry: RegistryFile): Promise<void> => {
  const state = await registry.read();
  const rows = await describeEntries(state.entries);
  sendJson(res, 200, { html: renderProjects(rows, state.staleReason) });
};

/**
 * The file as it is at this moment, and the entries it holds. A registry that
 * cannot be parsed is the same condition the page's stale notice reports, and it
 * refuses the write: patching a file the server cannot read would mean writing
 * back what it merely remembers, over whatever is actually there.
 */
const current = async (
  registry: RegistryFile,
): Promise<
  { ok: true; text: string | null; entries: RegistryEntry[] } | ({ ok: false } & Refusal)
> => {
  const read = await registry.readForWrite();
  if (!read.ok) {
    return { ok: false, field: null, message: `The registry file could not be read: ${read.error}` };
  }
  if (read.text === null) return { ok: true, text: null, entries: [] };
  const parsed = parseRegistry(read.text);
  if (!parsed.ok) {
    return {
      ok: false,
      field: null,
      message: `The registry file could not be read (${parsed.error}). Fix it and reload.`,
    };
  }
  return { ok: true, text: read.text, entries: parsed.entries };
};

const write = async (
  res: ServerResponse,
  registry: RegistryFile,
  text: string,
  what: string,
): Promise<void> => {
  try {
    await registry.writeText(text);
  } catch (err) {
    log.error(`${what}: write failed`, err);
    refuse(res, 500, {
      field: null,
      message: `The registry file could not be written: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  log.info(`registry ${what}`);
  await sendList(res, registry);
};

export const handleProjectAdd = async (
  req: IncomingMessage,
  res: ServerResponse,
  registry: RegistryFile,
): Promise<void> => {
  const body = await readJsonBody(req, res);
  if (body === null) return;
  if (typeof body.path !== 'string' || typeof body.id !== 'string') {
    sendText(res, 400, 'Body must be { path: string, id: string }');
    return;
  }
  const state = await current(registry);
  if (!state.ok) {
    refuse(res, 409, state);
    return;
  }
  const request = await validateAdd(state.entries, body.path, body.id);
  if (!request.ok) {
    refuse(res, 400, request);
    return;
  }
  const patched = addEntry(state.text, state.entries, request.id, request.folder);
  if (!patched.ok) {
    refuse(res, 400, patched);
    return;
  }
  await write(res, registry, patched.text, `add ${request.id}`);
};

export const handleProjectRemove = async (
  req: IncomingMessage,
  res: ServerResponse,
  registry: RegistryFile,
): Promise<void> => {
  const body = await readJsonBody(req, res);
  if (body === null) return;
  if (typeof body.id !== 'string') {
    sendText(res, 400, 'Body must be { id: string }');
    return;
  }
  const id = body.id;
  const state = await current(registry);
  if (!state.ok) {
    refuse(res, 409, state);
    return;
  }
  // Gone from the file already — by a hand edit, or by a second tab. What was
  // asked for holds, and the refreshed list is the truth about the file.
  if (state.text === null || !state.entries.some((entry) => entry.id === id)) {
    await sendList(res, registry);
    return;
  }
  const patched = removeEntry(state.text, state.entries, id);
  if (!patched.ok) {
    refuse(res, 400, patched);
    return;
  }
  await write(res, registry, patched.text, `remove ${id}`);
};
