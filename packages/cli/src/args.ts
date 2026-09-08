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
  'version',
  'dry-run',
  'no-epic',
  'no-release',
  'up',
  'down',
  'backlog',
  'full',
  'all',
]);

export interface ParseArgsOptions {
  // Flags that consume every following non-flag token, not just the next one.
  // Default is one token, so a positional after `--type` stays a positional.
  multiValueFlags?: ReadonlySet<string>;
}

export function parseArgs(
  argv: readonly string[],
  options: ParseArgsOptions = {},
): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, FlagValue> = {};
  const multiValueFlags = options.multiValueFlags;

  // A repeated value flag accumulates instead of overwriting; readers that want
  // a single value take the last one. A boolean flag never accumulates —
  // repeating it means the same thing, and callers compare it to `true`.
  const set = (name: string, value: string | boolean): void => {
    const existing = flags[name];
    if (existing === undefined || BOOLEAN_FLAGS.has(name)) {
      flags[name] = value;
      return;
    }
    const asEntry = (v: string | boolean): string => (v === true ? '' : String(v));
    flags[name] = [
      ...(Array.isArray(existing) ? existing : [asEntry(existing)]),
      asEntry(value),
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
      const name = body.slice(0, eq);
      set(name, body.slice(eq + 1));
      if (multiValueFlags?.has(name) === true) {
        while (i + 1 < argv.length) {
          const token = argv[i + 1];
          if (token === undefined || token.startsWith('--')) break;
          set(name, token);
          i++;
        }
      }
      continue;
    }

    if (BOOLEAN_FLAGS.has(body)) {
      set(body, true);
      continue;
    }

    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      if (multiValueFlags?.has(body) === true) {
        while (i + 1 < argv.length) {
          const token = argv[i + 1];
          if (token === undefined || token.startsWith('--')) break;
          set(body, token);
          i++;
        }
      } else {
        set(body, next);
        i++;
      }
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
