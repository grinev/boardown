import type { ProjectStateFile, RegistryFile } from '@boardown/projects';

export interface ProjectPreference {
  read: () => Promise<string | null>;
  write: (id: string | null) => Promise<void>;
}

export function projectPreference(
  state: ProjectStateFile,
  registry: RegistryFile,
): ProjectPreference {
  const key = () => registry.key();
  return {
    read: async () => {
      const [current, registryKey] = await Promise.all([state.read(), key()]);
      return current.webLastProjectByRegistry[registryKey] ?? null;
    },
    write: async (id) => {
      const registryKey = await key();
      await state.update((current) => {
        const results = current.webLastProjectByRegistry;
        if ((results[registryKey] ?? null) === id) return current;
        const next = { ...results };
        if (id === null) delete next[registryKey];
        else next[registryKey] = id;
        return { ...current, webLastProjectByRegistry: next };
      });
    },
  };
}
