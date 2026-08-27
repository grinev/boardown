import {
  REPO_REF_PREFIX,
  projectFileName,
  projectFilePathFromRefToken,
} from '@boardown/core';
import { URL_PATTERN_SOURCE, trimUrlEnd } from './urls';

export interface TextSegment {
  kind: 'text';
  text: string;
}

export interface TaskRefSegment {
  kind: 'task-ref';
  id: string;
}

export interface DocRefSegment {
  kind: 'doc-ref';
  token: string;
  // The token exactly as written, so an unresolved reference can render as the
  // user typed it.
  raw: string;
}

// A file anywhere in the project folder. Carries the normalized path and the file
// name because nothing resolves it later: the project is not indexed, so this is
// all the renderer ever knows about the target.
export interface RepoRefSegment {
  kind: 'repo-ref';
  path: string;
  name: string;
  raw: string;
}

// An `http`/`https` URL to somewhere outside boardown. The scheme is part of the
// pattern that produced it, so the renderer can put `url` straight into an href.
export interface UrlSegment {
  kind: 'url';
  url: string;
}

export type RefSegment =
  | TextSegment
  | TaskRefSegment
  | DocRefSegment
  | RepoRefSegment
  | UrlSegment;

// One pass over both reference shapes, so `[[BD-7]]` cannot be claimed by two
// scanners at once: the wiki token starts first at that position and wins.
// Task ids are the id-prefix shape (2-5 uppercase letters + digits); a wiki token
// holds anything but brackets and newlines. Whether either resolves to something
// on the board is the caller's question.
// The URL alternative comes last, so a `[[…]]` holding a URL is still a wiki token
// and renders as the user typed it rather than as a link.
const REF_REGEX = new RegExp(
  `\\[\\[([^[\\]\\n]*)\\]\\]|(?<![\\w-])[A-Z]{2,5}-\\d+(?![\\w-])|(${URL_PATTERN_SOURCE})`,
  'g',
);

export const splitRefs = (text: string): RefSegment[] => {
  const segments: RefSegment[] = [];
  let cursor = 0;

  const pushText = (value: string): void => {
    if (value === '') return;
    const last = segments[segments.length - 1];
    if (last?.kind === 'text') last.text += value;
    else segments.push({ kind: 'text', text: value });
  };

  for (const match of text.matchAll(REF_REGEX)) {
    const start = match.index;
    pushText(text.slice(cursor, start));
    cursor = start + match[0].length;

    const raw = match[2];
    if (raw !== undefined) {
      const url = trimUrlEnd(raw);
      // Prose runs its punctuation up against the URL, so what the pattern took
      // greedily is handed back to the text that follows.
      if (url === '') pushText(raw);
      else {
        segments.push({ kind: 'url', url });
        pushText(raw.slice(url.length));
      }
      continue;
    }

    const wiki = match[1];
    if (wiki === undefined) {
      segments.push({ kind: 'task-ref', id: match[0] });
      continue;
    }
    const token = wiki.trim();
    if (token === '') {
      // `[[]]` / `[[   ]]` point at nothing — plain text, like any other token
      // that resolves to nothing.
      pushText(match[0]);
    } else if (token.startsWith(REPO_REF_PREFIX)) {
      const path = projectFilePathFromRefToken(token);
      // Only `[[repo:]]` with no path is not a reference. Everything else is a
      // link on sight — a path that escapes the project folder included, since
      // the shell is what refuses it, and saying so on click beats dead text.
      if (path === null) pushText(match[0]);
      else segments.push({ kind: 'repo-ref', path, name: projectFileName(path), raw: match[0] });
    } else {
      segments.push({ kind: 'doc-ref', token, raw: match[0] });
    }
  }

  pushText(text.slice(cursor));

  return segments;
};
