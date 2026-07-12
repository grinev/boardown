export interface TextSegment {
  kind: 'text';
  text: string;
}

export interface RefSegment {
  kind: 'ref';
  id: string;
}

export type TaskRefSegment = TextSegment | RefSegment;

// Task-id shape only (2-5 uppercase letters + digits, matching ID_PREFIX_REGEX);
// whether the id exists on the board is the caller's question.
const TASK_REF_REGEX = /(?<![\w-])[A-Z]{2,5}-\d+(?![\w-])/g;

export const splitTaskRefs = (text: string): TaskRefSegment[] => {
  const segments: TaskRefSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TASK_REF_REGEX)) {
    const start = match.index;
    if (start > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, start) });
    }
    segments.push({ kind: 'ref', id: match[0] });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) });
  }

  return segments;
};
