export interface FileStat {
  lastModified: number;
}

export interface FsEntry {
  name: string;
  isDirectory: boolean;
}

export interface FsAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  list(dir: string): Promise<FsEntry[]>;
  stat(path: string): Promise<FileStat | null>;
  mkdir(dir: string): Promise<void>;
  // Removes a file, or a directory with everything beneath it. Removing a path
  // that does not exist is not an error.
  remove(path: string): Promise<void>;
}
