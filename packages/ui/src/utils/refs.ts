import {
  REPO_REF_PREFIX,
  projectFileName,
  projectFilePathFromRefToken,
} from '@boardown/core';

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

export type RefSegment = TextSegment | TaskRefSegment | DocRefSegment | RepoRefSegment;

// One pass over both reference shapes, so `[[BD-7]]` cannot be claimed by two
// scanners at once: the wiki token starts first at that position and wins.
// Task ids are the id-prefix shape (2-5 uppercase letters + digits); a wiki token
// holds anything but brackets and newlines. Whether either resolves to something
// on the board is the caller's question.
const REF_REGEX = /\[\[([^[\]\n]*)\]\]|(?<![\w-])[A-Z]{2,5}-\d+(?![\w-])/g;

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
