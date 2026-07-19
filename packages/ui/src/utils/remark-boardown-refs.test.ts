import { describe, expect, it } from 'vitest';
import {
  DOC_HREF,
  TASK_HREF,
  linkifyText,
  linkifyTree,
  type MdNode,
  type ToRefLink,
} from './remark-boardown-refs';

// Everything resolves except the tokens spelled `missing`/`BD-999`.
const toLink: ToRefLink = (segment) => {
  if (segment.kind === 'doc-ref') {
    return segment.token === 'missing'
      ? null
      : { href: `${DOC_HREF}docs/${segment.token}.md`, label: `Page ${segment.token}` };
  }
  return segment.id === 'BD-999'
    ? null
    : { href: `${TASK_HREF}${segment.id}`, label: `${segment.id} Some task` };
};

const text = (value: string): MdNode => ({ type: 'text', value });

describe('linkifyText', () => {
  it('leaves a string without references as one text node', () => {
    expect(linkifyText('Nothing here.', toLink)).toEqual([text('Nothing here.')]);
  });

  it('turns a doc token into a link node', () => {
    expect(linkifyText('See [[intro]].', toLink)).toEqual([
      text('See '),
      {
        type: 'link',
        url: `${DOC_HREF}docs/intro.md`,
        title: null,
        children: [text('Page intro')],
      },
      text('.'),
    ]);
  });

  it('turns a task id into a link node', () => {
    expect(linkifyText('BD-1', toLink)).toEqual([
      {
        type: 'link',
        url: `${TASK_HREF}BD-1`,
        title: null,
        children: [text('BD-1 Some task')],
      },
    ]);
  });

  it('leaves an unresolved reference as the raw text it was written as', () => {
    expect(linkifyText('a [[missing]] b BD-999 c', toLink)).toEqual([
      text('a [[missing]] b BD-999 c'),
    ]);
  });

  it('handles both kinds in one string', () => {
    const out = linkifyText('[[intro]] and BD-2', toLink);
    expect(out.map((n) => n.type)).toEqual(['link', 'text', 'link']);
  });
});

describe('linkifyTree', () => {
  it('rewrites text inside a paragraph', () => {
    const tree: MdNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [text('See [[intro]]')] }],
    };
    linkifyTree(tree, toLink);
    expect(tree.children![0]!.children!.map((n) => n.type)).toEqual(['text', 'link']);
  });

  it('leaves an inline code span alone', () => {
    const tree: MdNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'inlineCode', value: '[[intro]] BD-1' }],
        },
      ],
    };
    linkifyTree(tree, toLink);
    expect(tree.children![0]!.children).toEqual([
      { type: 'inlineCode', value: '[[intro]] BD-1' },
    ]);
  });

  it('leaves a fenced code block alone', () => {
    const tree: MdNode = {
      type: 'root',
      children: [{ type: 'code', value: 'see [[intro]] and BD-1' }],
    };
    linkifyTree(tree, toLink);
    expect(tree.children).toEqual([{ type: 'code', value: 'see [[intro]] and BD-1' }]);
  });

  it('never nests a link inside an existing link label', () => {
    const tree: MdNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url: 'https://example.com',
              children: [text('[[intro]] BD-1')],
            },
          ],
        },
      ],
    };
    linkifyTree(tree, toLink);
    expect(tree.children![0]!.children![0]!.children).toEqual([
      text('[[intro]] BD-1'),
    ]);
  });

  it('descends into nested structure such as a list item', () => {
    const tree: MdNode = {
      type: 'root',
      children: [
        {
          type: 'list',
          children: [
            {
              type: 'listItem',
              children: [{ type: 'paragraph', children: [text('[[intro]]')] }],
            },
          ],
        },
      ],
    };
    linkifyTree(tree, toLink);
    const paragraph = tree.children![0]!.children![0]!.children![0]!;
    expect(paragraph.children!.map((n) => n.type)).toEqual(['link']);
  });
});
