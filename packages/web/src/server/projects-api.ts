import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '@boardown/core';
import {
  describeEntries,
  isProjectDirectory,
  RegistryError,
  type RegistryFile,
} from '@boardown/projects';
import { readJsonBody, sendJson, sendText } from '../api/board-api.js';
import {
  PROJECTS_ADD,
  PROJECTS_ENDPOINT,
  PROJECTS_PICK,
  PROJECTS_PREFERENCE,
  PROJECTS_REGISTERED,
  PROJECTS_REMOVE,
  type ProjectsSnapshot,
} from '../projects-endpoint.js';
import { FolderChooserUnavailable } from './folder-chooser.js';
import type { ProjectPreference } from './project-preference.js';

const log = createLogger('web.projects-api');

export interface ProjectsApi {
  registry: RegistryFile;
  pickFolder: () => Promise<string | null>;
  preference?: ProjectPreference;
}

export async function handleProjects(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  { registry, preference, pickFolder }: ProjectsApi,
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET' && url.pathname === PROJECTS_ENDPOINT) {
      const state = await registry.read();
      const projects = await describeEntries(state.entries);
      sendJson(res, 200, { projects, error: state.staleReason } satisfies ProjectsSnapshot);
      return;
    }
    if (req.method === 'GET' && url.pathname === PROJECTS_REGISTERED) {
      const state = await registry.read();
      const project = state.entries.find((entry) => entry.id === url.searchParams.get('id'));
      sendJson(res, 200, {
        registered: project !== undefined,
        available: project !== undefined && (await isProjectDirectory(project.projectRoot)),
      });
      return;
    }
    if (req.method !== 'POST') {
      sendText(res, 404, 'Not found');
      return;
    }
    if (
      req.headers['sec-fetch-site'] === 'cross-site' ||
      req.headers['sec-fetch-site'] === 'same-site'
    ) {
      sendText(res, 403, 'Project actions must be same-origin');
      return;
    }
    const body = await readJsonBody(req, res);
    if (body === null) return;
    switch (url.pathname) {
      case PROJECTS_ADD: {
        if (typeof body.path !== 'string' || typeof body.id !== 'string') {
          sendText(res, 400, 'Body must be { path: string, id: string }');
          return;
        }
        const id = await registry.register(body.path, body.id);
        log.info(`registered project ${id}`);
        sendJson(res, 200, { id });
        return;
      }
      case PROJECTS_PICK: {
        const folder = await pickFolder();
        const id = folder === null ? null : await registry.register(folder);
        if (id !== null) log.info(`opened registered project ${id}`);
        sendJson(res, 200, { id });
        return;
      }
      case PROJECTS_REMOVE: {
        if (typeof body.id !== 'string') {
          sendText(res, 400, 'Body must be { id: string }');
          return;
        }
        await registry.remove(body.id);
        log.info(`unregistered project ${body.id}`);
        sendJson(res, 200, {});
        return;
      }
      case PROJECTS_PREFERENCE: {
        const id = body.id;
        if (id !== null && typeof id !== 'string') {
          sendText(res, 400, 'Body must be { id: string | null }');
          return;
        }
        if (id !== null && !(await registry.read()).entries.some((entry) => entry.id === id)) {
          sendText(res, 404, 'Project is no longer registered');
          return;
        }
        await preference?.write(id);
        sendJson(res, 200, {});
        return;
      }
      default:
        sendText(res, 404, 'Not found');
    }
  } catch (error) {
    const status =
      error instanceof RegistryError
        ? error.status
        : error instanceof FolderChooserUnavailable
          ? 503
          : 500;
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, status, { message });
  }
}
