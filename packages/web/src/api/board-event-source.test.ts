import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToBoardChanges } from './board-event-source';

// The rule this file exists for — a tab holds the stream only while it is on
// screen — cannot be driven in a real browser under automation: Chromium reports
// every page as visible however the tabs are arranged. So the two things it reads
// from the page, `document` and `EventSource`, are stood in for here.

let streams: FakeEventSource[] = [];
let visibility: DocumentVisibilityState = 'visible';
let onVisibilityChange: (() => void) | undefined;
let refreshes = 0;

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  readyState: number = FakeEventSource.CONNECTING;
  closed = false;
  private readonly listeners = new Map<string, (() => void)[]>();

  constructor(readonly url: string) {
    streams.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type: string, readyState = this.readyState): void {
    this.readyState = readyState;
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

const show = (): void => {
  visibility = 'visible';
  onVisibilityChange?.();
};

const hide = (): void => {
  visibility = 'hidden';
  onVisibilityChange?.();
};

const subscribe = (): void => {
  subscribeToBoardChanges('/api/events', 'tab-a', () => {
    refreshes += 1;
  });
};

const live = (): FakeEventSource => {
  const last = streams.at(-1);
  if (last === undefined) throw new Error('no stream was opened');
  return last;
};

beforeEach(() => {
  streams = [];
  refreshes = 0;
  visibility = 'visible';
  onVisibilityChange = undefined;
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('document', {
    get visibilityState(): DocumentVisibilityState {
      return visibility;
    },
    addEventListener: (_type: string, listener: () => void) => {
      onVisibilityChange = listener;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('subscribeToBoardChanges', () => {
  it('opens one stream, carrying the tab id the writes will carry', () => {
    subscribe();
    expect(streams).toHaveLength(1);
    expect(live().url).toBe('/api/events?client=tab-a');
  });

  it('refreshes on a change the server pushes', () => {
    subscribe();
    live().emit('open');
    live().emit('board-changed');
    live().emit('board-changed');
    expect(refreshes).toBe(2);
  });

  it('does not refresh on the opening that belongs to the page load', () => {
    subscribe();
    live().emit('open');
    expect(refreshes).toBe(0);
  });

  it('opens nothing for a tab that loads in the background', () => {
    visibility = 'hidden';
    subscribe();
    expect(streams).toHaveLength(0);
  });

  it('refreshes such a tab the first time it is looked at', () => {
    visibility = 'hidden';
    subscribe();
    show();
    expect(streams).toHaveLength(1);
    live().emit('open');
    expect(refreshes).toBe(1);
  });

  it('lets the stream go while hidden and takes a fresh one back', () => {
    subscribe();
    live().emit('open');
    const first = live();

    hide();
    expect(first.closed).toBe(true);
    expect(streams).toHaveLength(1);

    show();
    expect(streams).toHaveLength(2);
    live().emit('open');
    expect(refreshes).toBe(1);
  });

  it('opens no second stream while it already holds one', () => {
    subscribe();
    live().emit('open');
    show();
    show();
    expect(streams).toHaveLength(1);
  });

  it('refreshes once when a dropped connection comes back', () => {
    subscribe();
    const stream = live();
    stream.emit('open');
    // The browser reconnects by itself, so the same stream errors and reopens.
    stream.emit('error', FakeEventSource.CONNECTING);
    expect(refreshes).toBe(0);
    stream.emit('open');
    expect(refreshes).toBe(1);
  });

  it('stops for the run when the server answers that it does not stream', () => {
    subscribe();
    // `--no-watch` 404s, which fails the connection for good rather than retrying.
    live().emit('error', FakeEventSource.CLOSED);
    hide();
    show();
    expect(streams).toHaveLength(1);
    expect(refreshes).toBe(0);
  });
});
