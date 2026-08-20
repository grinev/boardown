// A creation dialog submits on Cmd/Ctrl+Enter from any focus position inside it.
// The `defaultPrevented` half is the load-bearing one: a picker listbox and the
// `[[…]]` suggestion list both prevent the default on Enter, and an open popup
// keeps the key regardless of the modifier.
export interface SubmitShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
}

export function isSubmitShortcut(event: SubmitShortcutEvent): boolean {
  if (event.defaultPrevented) return false;
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey);
}
