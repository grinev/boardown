// Where an external URL starts and ends inside ordinary prose. Only `http` and
// `https` are recognised: the scheme is what tells a link apart from a pasted
// path, and every extra scheme is one more thing a path can be mistaken for.
//
// The body runs greedily to the first whitespace or `<>"`, which is what a URL
// cannot contain unencoded anyway, and the tail is then walked back by
// `trimUrlEnd` — prose puts its punctuation right up against a URL, and the
// sentence's full stop is not part of the address.
//
// The scheme is spelled out letter by letter rather than carrying an `i` flag,
// because `refs.ts` embeds this pattern beside `[A-Z]{2,5}-\d+`: a flag would make
// that alternative case-insensitive too and turn `bd-7` into a task reference.
// Matching `HTTP://` matters because remark-gfm autolinks it in a markdown body,
// and the same text must not mean two different things in two fields.
export const URL_PATTERN_SOURCE = '[hH][tT][tT][pP][sS]?:\\/\\/[^\\s<>"]+';

const URL_REGEX = new RegExp(URL_PATTERN_SOURCE, 'g');

const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);

const SCHEME_END = '://';

// A closer the URL never opened belongs to whatever the URL was written inside —
// the writer's parentheses, or a `[[…]]` token in a previewed repo file.
const BRACKET_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['(', ')'],
  ['[', ']'],
];

const countChar = (value: string, char: string): number => {
  let count = 0;
  for (const c of value) if (c === char) count += 1;
  return count;
};

// How much of `match` is really the URL. Trailing sentence punctuation comes off,
// and a trailing closer comes off only when the URL never opened one — so a wiki
// article ending in `_(disambiguation))` keeps its own pair and loses the writer's.
// Returns an empty string when nothing but the scheme is left, which is not a URL.
export const trimUrlEnd = (match: string): string => {
  let end = match.length;
  for (;;) {
    const last = match[end - 1];
    if (last === undefined) break;
    if (TRAILING_PUNCTUATION.has(last)) {
      end -= 1;
      continue;
    }
    const pair = BRACKET_PAIRS.find(([, close]) => close === last);
    if (pair !== undefined) {
      const kept = match.slice(0, end);
      if (countChar(kept, pair[1]) > countChar(kept, pair[0])) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  const url = match.slice(0, end);
  return url.endsWith(SCHEME_END) ? '' : url;
};

export interface UrlPiece {
  kind: 'url';
  url: string;
}

export interface TextPiece {
  kind: 'text';
  text: string;
}

export type UrlSplitPiece = TextPiece | UrlPiece;

// The scan on its own, for a caller that wants URLs and no board references — the
// plain pane of the repo file preview, where boardown's own tokens stay literal.
export const splitUrls = (text: string): UrlSplitPiece[] => {
  const pieces: UrlSplitPiece[] = [];
  let cursor = 0;

  const pushText = (value: string): void => {
    if (value === '') return;
    const last = pieces[pieces.length - 1];
    if (last?.kind === 'text') last.text += value;
    else pieces.push({ kind: 'text', text: value });
  };

  for (const match of text.matchAll(URL_REGEX)) {
    const start = match.index;
    pushText(text.slice(cursor, start));
    cursor = start + match[0].length;

    const url = trimUrlEnd(match[0]);
    if (url === '') {
      pushText(match[0]);
      continue;
    }
    pieces.push({ kind: 'url', url });
    pushText(match[0].slice(url.length));
  }

  pushText(text.slice(cursor));

  return pieces;
};
