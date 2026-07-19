export interface OpenDocRefToken {
  // Offset of the opening `[[`.
  start: number;
  query: string;
}

// The token being typed right now: an unclosed `[[` whose tail runs up to the
// caret. Anything that would have ended or nested the token (a bracket, a
// newline) means the caret is no longer inside one.
export const findOpenDocRefToken = (
  text: string,
  caret: number,
): OpenDocRefToken | null => {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('[[');
  if (start === -1) return null;
  const query = before.slice(start + 2);
  if (/[[\]\n]/.test(query)) return null;
  return { start, query };
};
