import { z } from 'zod';
import { REGISTRY_ID_PATTERN } from '@boardown/core';
import { withFileLock } from './file-lock.js';
import { errorMessage, readOptional, replaceText } from './files.js';

const stateSchema = z.strictObject({
  defaultRegistryMigrated: z.boolean().default(false),
  webLastProjectByRegistry: z.record(z.string(), z.string().regex(REGISTRY_ID_PATTERN)).default({}),
});

type ProjectState = z.infer<typeof stateSchema>;

export class ProjectStateFile {
  constructor(readonly filePath: string) {}

  async read(): Promise<ProjectState> {
    const text = await readOptional(this.filePath);
    try {
      const raw: unknown = text === null ? {} : JSON.parse(text);
      return stateSchema.parse(raw);
    } catch (error) {
      throw new Error(`Cannot read project state ${this.filePath}: ${errorMessage(error)}`);
    }
  }

  async update(
    change: (current: ProjectState) => ProjectState | Promise<ProjectState>,
  ): Promise<void> {
    await withFileLock(this.filePath, async () => {
      const current = await this.read();
      const next = await change(current);
      if (next !== current) {
        await replaceText(this.filePath, `${JSON.stringify(stateSchema.parse(next), null, 2)}\n`);
      }
    });
  }
}
