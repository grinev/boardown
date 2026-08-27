import { FileCode2, FileText } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { docPageTitle, isTerminalStatus, resolveDocRef } from '@boardown/core';
import { useBoardStore } from '../store';
import { findTaskById } from '../utils/find-task';
import {
  DOC_HREF,
  REPO_HREF,
  TASK_HREF,
  remarkBoardownRefs,
  type ToRefLink,
} from '../utils/remark-boardown-refs';
import styles from './MarkdownContent.module.css';

interface MarkdownContentProps {
  source: string;
  // What a doc-ref link does when clicked: navigate the Docs tab in place
  // (openDocPage) or swap the popup that is showing this body (openDocPopup).
  // Omitted for a body that is not board text — a file previewed from the repo —
  // where no reference token is turned into a link at all.
  onDocRefClick?: (path: string) => void;
}

// react-markdown drops URLs with an unknown protocol, which would strip the
// in-app hrefs the plugin emits.
const urlTransform = (url: string): string =>
  url.startsWith('boardown:') ? url : defaultUrlTransform(url);

// Case-insensitive: remark-gfm autolinks `HTTP://…` and keeps the casing, and an
// href that slipped past this would top-navigate the board tab away from the app.
const EXTERNAL_HREF = /^https?:\/\//i;

const isExternalHref = (href: string): boolean => EXTERNAL_HREF.test(href);

// No rehype-raw: embedded HTML renders as text rather than markup, which is the
// product's requirement and react-markdown's default, so no sanitizer is needed.
export function MarkdownContent({ source, onDocRefClick }: MarkdownContentProps) {
  const snapshot = useBoardStore((s) => s.snapshot);
  const openTask = useBoardStore((s) => s.openTask);
  const openRepoFilePopup = useBoardStore((s) => s.openRepoFilePopup);

  const toLink = useCallback<ToRefLink>(
    (segment) => {
      if (snapshot === null) return null;
      if (segment.kind === 'doc-ref') {
        const page = resolveDocRef(snapshot.docs, segment.token);
        return page === null
          ? null
          : { href: `${DOC_HREF}${page.path}`, label: docPageTitle(page) };
      }
      if (segment.kind === 'repo-ref') {
        return { href: `${REPO_HREF}${segment.path}`, label: segment.name };
      }
      const task = findTaskById(snapshot, segment.id);
      return task === null
        ? null
        : { href: `${TASK_HREF}${segment.id}`, label: `${segment.id} ${task.title}` };
    },
    [snapshot],
  );

  const remarkPlugins = useMemo(
    () =>
      onDocRefClick === undefined
        ? [remarkGfm]
        : [remarkGfm, remarkBoardownRefs(toLink)],
    [toLink, onDocRefClick],
  );

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href !== undefined && href.startsWith(DOC_HREF) && onDocRefClick) {
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
        if (href !== undefined && href.startsWith(REPO_HREF)) {
          const path = href.slice(REPO_HREF.length);
          return (
            <button
              type="button"
              className={styles.refLink}
              title={path}
              onClick={() => openRepoFilePopup(path)}
            >
              <FileCode2 size={14} className={styles.refIcon} aria-hidden="true" />
              {children}
            </button>
          );
        }
        if (href !== undefined && href.startsWith(TASK_HREF)) {
          const id = href.slice(TASK_HREF.length);
          const target = snapshot === null ? null : findTaskById(snapshot, id);
          const done =
            target !== null && isTerminalStatus(snapshot?.config, target.frontmatter.status);
          return (
            <button
              type="button"
              className={done ? `${styles.refLink} ${styles.refLinkDone}` : styles.refLink}
              onClick={() => openTask(id)}
            >
              {children}
            </button>
          );
        }
        // An external target opens outside the app; an in-page `#anchor`, a
        // relative path or a `mailto:` gfm made from an email keeps behaving as
        // it does today, since a new tab would help none of them.
        if (href !== undefined && isExternalHref(href)) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        }
        return <a href={href}>{children}</a>;
      },
    }),
    [onDocRefClick, openTask, openRepoFilePopup, snapshot],
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
