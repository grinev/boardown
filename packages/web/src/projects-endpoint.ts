import type { BoardListRow } from '@boardown/projects';

export const PROJECTS_ENDPOINT = '/api/projects';
export const PROJECTS_ADD = `${PROJECTS_ENDPOINT}/add`;
export const PROJECTS_REMOVE = `${PROJECTS_ENDPOINT}/remove`;
export const PROJECTS_PICK = `${PROJECTS_ENDPOINT}/pick`;
export const PROJECTS_PREFERENCE = `${PROJECTS_ENDPOINT}/preference`;
export const PROJECTS_REGISTERED = `${PROJECTS_ENDPOINT}/registered`;
export const PROJECTS_THEME_EVENTS = `${PROJECTS_ENDPOINT}/theme-events`;

export interface ProjectsSnapshot {
  projects: BoardListRow[];
  error: string | null;
}

export interface RegistryBoot {
  id: string | null;
  restored: boolean;
  embedded: boolean;
  project: BoardListRow | null;
  error: string | null;
}

export const projectUrl = (id: string): string => `/b/${encodeURIComponent(id)}/`;
