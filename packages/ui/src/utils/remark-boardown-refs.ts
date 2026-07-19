import { splitRefs, type DocRefSegment, type TaskRefSegment } from './refs';

// A structural view of the mdast nodes the walk touches. `@types/mdast` is not a
// dependency of this package, and one traversal does not justify adding one.
export interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
}

export interface RefLink {
  href: string;
  label: string;
}

export type ToRefLink = (
  segment: DocRefSegment | TaskRefSegment,
) => RefLink | null;

export const DOC_HREF = 'boardown:doc/';
export const TASK_HREF = 'boardown:task/';

export const linkifyText = (value: string, toLink: ToRefLink): MdNode[] => {
  const segments = splitRefs(value);
  if (segments.every((s) => s.kind === 'text')) return [{ type: 'text', value }];

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
    const link = toLink(segment);
    if (link === null) {
      pushText(segment.kind === 'doc-ref' ? segment.raw : segment.id);
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
  const walk = (current: MdNode, insideLink: boolean): void => {
    const children = current.children;
    if (children === undefined) return;
    const next: MdNode[] = [];
    for (const child of children) {
      if (child.type === 'text' && child.value !== undefined && !insideLink) {
        next.push(...linkifyText(child.value, toLink));
      } else {
        walk(
          child,
          insideLink || child.type === 'link' || child.type === 'linkReference',
        );
        next.push(child);
      }
    }
    current.children = next;
  };
  walk(node, false);
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
