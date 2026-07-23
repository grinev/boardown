import { FileText } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { docPageTitle, resolveDocRef } from '@boardown/core';
import { useBoardStore } from '../store';
import { findTaskById } from '../utils/find-task';
import {
  DOC_HREF,
  TASK_HREF,
  remarkBoardownRefs,
  type ToRefLink,
} from '../utils/remark-boardown-refs';
import styles from './MarkdownContent.module.css';

interface MarkdownContentProps {
  source: string;
  // What a doc-ref link does when clicked: navigate the Docs tab in place
  // (openDocPage) or swap the popup that is showing this body (openDocPopup).
  onDocRefClick: (path: string) => void;
}

// react-markdown drops URLs with an unknown protocol, which would strip the
// in-app hrefs the plugin emits.
const urlTransform = (url: string): string =>
  url.startsWith('boardown:') ? url : defaultUrlTransform(url);

// No rehype-raw: embedded HTML renders as text rather than markup, which is the
// product's requirement and react-markdown's default, so no sanitizer is needed.
export function MarkdownContent({ source, onDocRefClick }: MarkdownContentProps) {
  const snapshot = useBoardStore((s) => s.snapshot);
  const openTask = useBoardStore((s) => s.openTask);

  const toLink = useCallback<ToRefLink>(
    (segment) => {
      if (snapshot === null) return null;
      if (segment.kind === 'doc-ref') {
        const page = resolveDocRef(snapshot.docs, segment.token);
        return page === null
          ? null
          : { href: `${DOC_HREF}${page.path}`, label: docPageTitle(page) };
      }
      const task = findTaskById(snapshot, segment.id);
      return task === null
        ? null
        : { href: `${TASK_HREF}${segment.id}`, label: `${segment.id} ${task.title}` };
    },
    [snapshot],
  );

  const remarkPlugins = useMemo(
    () => [remarkGfm, remarkBoardownRefs(toLink)],
    [toLink],
  );

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href !== undefined && href.startsWith(DOC_HREF)) {
          const path = href.slice(DOC_HREF.length);
          return (
            <button
              type="button"
              className={styles.refLink}
              onClick={() => onDocRefClick(path)}
            >
              <FileText size={14} className={styles.refIcon} aria-hidden="true" />
              {children}
            </button>
          );
        }
        if (href !== undefined && href.startsWith(TASK_HREF)) {
          const id = href.slice(TASK_HREF.length);
          return (
            <button type="button" className={styles.refLink} onClick={() => openTask(id)}>
              {children}
            </button>
          );
        }
        return <a href={href}>{children}</a>;
      },
    }),
    [onDocRefClick, openTask],
  );

  return (
    <div className={styles.markdown}>
      <Markdown
        remarkPlugins={remarkPlugins}
        components={components}
        urlTransform={urlTransform}
      >
        {source}
      </Markdown>
    </div>
  );
}
