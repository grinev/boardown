import {
  mapMarkdownText,
  splitRefs,
  type DocRefSegment,
  type MdNode,
  type RepoRefSegment,
  type TaskRefSegment,
} from '@boardown/core';
export type { MdNode } from '@boardown/core';

export interface RefLink {
  href: string;
  label: string;
}

export type ToRefLink = (
  segment: DocRefSegment | TaskRefSegment | RepoRefSegment,
) => RefLink | null;

export const DOC_HREF = 'boardown:doc/';
export const TASK_HREF = 'boardown:task/';
export const REPO_HREF = 'boardown:repo/';

export const linkifyText = (value: string, toLink: ToRefLink): MdNode[] => {
  const segments = splitRefs(value);
  // A URL is not this transformer's business: remark-gfm autolinks the ones it
  // wants during parsing, so one still sitting in a text node here is one it
  // deliberately left alone.
  if (segments.every((s) => s.kind === 'text' || s.kind === 'url'))
    return [{ type: 'text', value }];

  const out: MdNode[] = [];
  const pushText = (text: string): void => {
    if (text === '') return;
    const last = out[out.length - 1];
    if (last !== undefined && last.type === 'text') {
      last.value = `${last.value ?? ''}${text}`;
    } else {
      out.push({ type: 'text', value: text });
    }
  };

  for (const segment of segments) {
    if (segment.kind === 'text') {
      pushText(segment.text);
      continue;
    }
    if (segment.kind === 'url') {
      pushText(segment.url);
      continue;
    }
    const link = toLink(segment);
    if (link === null) {
      pushText(segment.kind === 'task-ref' ? segment.id : segment.raw);
      continue;
    }
    out.push({
      type: 'link',
      url: link.href,
      title: null,
      children: [{ type: 'text', value: link.label }],
    });
  }

  return out;
};

export const linkifyTree = (node: MdNode, toLink: ToRefLink): void => {
  mapMarkdownText(node, (value) => linkifyText(value, toLink));
};

// Rewrites reference tokens inside `text` nodes into ordinary link nodes. Working
// on the parsed tree rather than the source is what keeps code spans and fenced
// blocks literal — their content is not a `text` node, so the walk never reaches
// it — and children of an existing link are skipped so no nested link is built.
export const remarkBoardownRefs =
  (toLink: ToRefLink) =>
  () =>
  (tree: unknown): void => {
    // The unified transformer signature hands over a bare unist node; this is the
    // one place the tree is narrowed to the shape the walk relies on.
    linkifyTree(tree as MdNode, toLink);
  };
