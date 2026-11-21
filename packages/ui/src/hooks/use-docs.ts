import { useEffect } from 'react';
import { useBoardStore } from '../store';

export function useDocsTree(active = true) {
  const tree = useBoardStore((s) => s.docsTree);
  const fs = useBoardStore((s) => s.fs);
  const demand = useBoardStore((s) => s.demandDocsTree);
  useEffect(() => (active ? demand() : undefined), [active, demand, fs]);
  return tree;
}

export function useDocPage(path: string | null) {
  const fs = useBoardStore((s) => s.fs);
  const page = useBoardStore((s) => (path === null ? undefined : s.docPages[path]));
  const load = useBoardStore((s) => s.loadDocPage);
  useEffect(() => {
    if (path !== null) void load(path);
  }, [fs, load, path]);
  return page;
}
