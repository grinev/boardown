import yaml from 'js-yaml';
import { z } from 'zod';

export const REGISTRY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export type IsAbsolutePath = (value: string) => boolean;

export interface ProjectRegistration {
  id: string;
  projectRoot: string;
}

export interface RegistryFolder {
  projectRoot: string;
  key: string;
  basename: string;
}

export interface IdentifiedRegistration extends RegistryFolder {
  id: string;
}

export type RegistryParse =
  | { ok: true; entries: ProjectRegistration[] }
  | { ok: false; error: string };

const registrySchema = z.object({ projects: z.record(z.string(), z.string()) });

export function parseProjectRegistry(text: string, isAbsolute: IsAbsolutePath): RegistryParse {
  let raw: unknown;
  try {
    raw = yaml.load(text);
  } catch (error) {
    return {
      ok: false,
      error: `invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const result = registrySchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues
        .map(({ path, message }) => `${path.join('.') || 'registry'}: ${message}`)
        .join('; '),
    };
  }
  const entries: ProjectRegistration[] = [];
  for (const [id, projectRoot] of Object.entries(result.data.projects)) {
    if (!REGISTRY_ID_PATTERN.test(id)) {
      return { ok: false, error: `id "${id}" must be lowercase letters, digits and dashes` };
    }
    if (!isAbsolute(projectRoot) || projectRoot.includes('\0')) {
      return { ok: false, error: `"${id}" must name an absolute path, got "${projectRoot}"` };
    }
    entries.push({ id, projectRoot });
  }
  return { ok: true, entries };
}

export function sameRegistrations(
  a: readonly ProjectRegistration[],
  b: readonly ProjectRegistration[],
): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(a.map(({ id, projectRoot }) => [id, projectRoot]));
  return b.every(({ id, projectRoot }) => byId.get(id) === projectRoot);
}

function slug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  );
}

function freeId(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export type RegistrationChoice =
  | { ok: true; id: string; existing: boolean }
  | { ok: false; conflict: boolean; message: string };

export function chooseProjectRegistration(
  current: readonly IdentifiedRegistration[],
  folder: RegistryFolder,
  requestedId?: string,
): RegistrationChoice {
  if (requestedId !== undefined && !REGISTRY_ID_PATTERN.test(requestedId)) {
    return {
      ok: false,
      conflict: false,
      message: 'An id uses lowercase letters, digits and dashes.',
    };
  }
  if (current.some((entry) => entry.id === requestedId && entry.key !== folder.key)) {
    return {
      ok: false,
      conflict: true,
      message: 'That id is already registered to another folder.',
    };
  }
  const existing = current.find(({ key }) => key === folder.key);
  if (existing !== undefined) return { ok: true, id: existing.id, existing: true };
  return {
    ok: true,
    id: requestedId ?? freeId(slug(folder.basename), new Set(current.map(({ id }) => id))),
    existing: false,
  };
}

export function legacyProjectAdditions(
  shared: readonly IdentifiedRegistration[],
  oldWeb: readonly IdentifiedRegistration[],
  electron: readonly RegistryFolder[],
): ProjectRegistration[] {
  const used = new Set(shared.map(({ id }) => id));
  const known = new Set(shared.map(({ key }) => key));
  const additions: ProjectRegistration[] = [];
  const collisions: IdentifiedRegistration[] = [];
  const add = (id: string, projectRoot: string) => {
    used.add(id);
    additions.push({ id, projectRoot });
  };
  for (const entry of oldWeb) {
    if (known.has(entry.key)) continue;
    known.add(entry.key);
    if (used.has(entry.id)) collisions.push(entry);
    else add(entry.id, entry.projectRoot);
  }
  for (const entry of collisions) add(freeId(entry.id, used), entry.projectRoot);
  for (const folder of electron) {
    if (known.has(folder.key)) continue;
    known.add(folder.key);
    add(freeId(slug(folder.basename), used), folder.projectRoot);
  }
  return additions;
}
