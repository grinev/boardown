export interface FileStat {
  lastModified: number;
  // In bytes.
  size: number;
}

export interface FsEntry {
  name: string;
  isDirectory: boolean;
}

export interface FsAdapter {
  read(path: string): Promise<string>;
  // Creates missing parent folders, as `write` does.
  write(path: string, content: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, content: Uint8Array): Promise<void>;
  list(dir: string): Promise<FsEntry[]>;
  stat(path: string): Promise<FileStat | null>;
  mkdir(dir: string): Promise<void>;
  // Removes a file, or a directory with everything beneath it. Removing a path
  // that does not exist is not an error.
  remove(path: string): Promise<void>;
}
