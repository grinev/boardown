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

export type RefSegment = TextSegment | TaskRefSegment | DocRefSegment;

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
    } else if (wiki.trim() === '') {
      // `[[]]` / `[[   ]]` point at nothing — plain text, like any other token
      // that resolves to nothing.
      pushText(match[0]);
    } else {
      segments.push({ kind: 'doc-ref', token: wiki.trim(), raw: match[0] });
    }
  }

  pushText(text.slice(cursor));

  return segments;
};
