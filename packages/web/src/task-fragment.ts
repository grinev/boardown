// `#task=<id>` asks the page to open that task's dialog — a host embedding the
// board jumps to a task by setting the frame's URL. The fragment is read like a
// query, so a repeated key counts by its first occurrence, as `?embed` does.
export const taskIdFromHash = (hash: string): string | null => {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('task');
  if (value === null) return null;
  const id = value.trim();
  return id === '' ? null : id;
};

// The page drops the fragment once it has read it, so the same id sent again is a
// new fragment navigation rather than a no-op. Path and query stay as they are.
export const urlWithoutHash = (location: { pathname: string; search: string }): string =>
  `${location.pathname}${location.search}`;
