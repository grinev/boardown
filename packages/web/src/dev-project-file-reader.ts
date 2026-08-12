import { createLogger, type ProjectFileRead, type ProjectFileReader } from '@boardown/core';
import { PROJECT_FILE_ENDPOINT } from './project-file-endpoint.js';

const log = createLogger('web.project-file');

// Its own object rather than a method on DevHttpFsAdapter: this one reads the
// project folder, and keeping the two surfaces apart is what stops a write path
// from ever holding it.
export class DevHttpProjectFileReader implements ProjectFileReader {
  async readFile(path: string): Promise<ProjectFileRead> {
    const res = await fetch(`${PROJECT_FILE_ENDPOINT}?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      log.error(`project-file ${path} failed: ${res.status}`);
      return { kind: 'unreadable' };
    }
    log.debug(`project-file ${path}`);
    return (await res.json()) as ProjectFileRead;
  }
}
