export interface FileStat {
  lastModified: number;
}

export interface FsAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  list(dir: string): Promise<string[]>;
  stat(path: string): Promise<FileStat | null>;
}
