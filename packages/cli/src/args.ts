export type FlagValue = string | boolean | string[];

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, FlagValue>;
}

// Flags that never take a value, so they don't swallow the following token
// (e.g. `task add "T" --json` must keep "T" as a positional).
const BOOLEAN_FLAGS = new Set([
  'json',
  'help',
  'dry-run',
  'no-epic',
  'no-release',
  'up',
  'down',
  'backlog',
  'full',
]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, FlagValue> = {};

  // A repeated value flag accumulates instead of overwriting; readers that want
  // a single value take the last one. A boolean flag never accumulates —
  // repeating it means the same thing, and callers compare it to `true`.
  const set = (name: string, value: string | boolean): void => {
    const existing = flags[name];
    if (existing === undefined || BOOLEAN_FLAGS.has(name)) {
      flags[name] = value;
      return;
    }
    flags[name] = [
      ...(Array.isArray(existing) ? existing : [String(existing)]),
      String(value),
    ];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      set(body.slice(0, eq), body.slice(eq + 1));
      continue;
    }

    if (BOOLEAN_FLAGS.has(body)) {
      set(body, true);
      continue;
    }

    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      set(body, next);
      i++;
    } else {
      set(body, true);
    }
  }

  return { positionals, flags };
}

const lastValue = (value: FlagValue | undefined): string | boolean | undefined =>
  Array.isArray(value) ? value[value.length - 1] : value;

export function flagString(flags: ParsedArgs['flags'], name: string): string | undefined {
  const value = lastValue(flags[name]);
  return typeof value === 'string' ? value : undefined;
}

export function flagBool(flags: ParsedArgs['flags'], name: string): boolean {
  const value = lastValue(flags[name]);
  return value === true || value === 'true';
}

export function flagList(flags: ParsedArgs['flags'], name: string): string[] {
  const value = flags[name];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}
