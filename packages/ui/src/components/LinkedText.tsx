import { FileCode2, FileText } from 'lucide-react';
import { Fragment, type KeyboardEvent } from 'react';
import { docPageTitle, isTerminalStatus, resolveDocRef } from '@boardown/core';
import { useBoardStore } from '../store';
import { findTaskById } from '../utils/find-task';
import { splitRefs } from '../utils/refs';
import styles from './LinkedText.module.css';

interface LinkedTextProps {
  text: string;
}

export function LinkedText({ text }: LinkedTextProps) {
  const snapshot = useBoardStore((s) => s.snapshot);
  const openTask = useBoardStore((s) => s.openTask);
  const openDocPopup = useBoardStore((s) => s.openDocPopup);
  const openRepoFilePopup = useBoardStore((s) => s.openRepoFilePopup);

  const segments = splitRefs(text);

  // The surrounding InlineEditText view is a role="button" that enters edit mode
  // on click and on Enter/Space; a link must shield both so activating it does
  // not also open the editor.
  const stopEditTrigger = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.kind === 'text') {
          return <Fragment key={i}>{segment.text}</Fragment>;
        }

        if (segment.kind === 'url') {
          // An anchor rather than a button: it has a real target, so the browser's
          // own link affordances work on it and each shell opens it the way it
          // already opens Settings' "Learn more".
          return (
            <a
              key={i}
              className={`${styles.link} ${styles.externalLink}`}
              href={segment.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={stopEditTrigger}
            >
              {segment.url}
            </a>
          );
        }

        if (segment.kind === 'doc-ref') {
          const page = snapshot ? resolveDocRef(snapshot.docs, segment.token) : null;
          if (!page) {
            return <Fragment key={i}>{segment.raw}</Fragment>;
          }
          return (
            <button
              key={i}
              type="button"
              className={styles.link}
              onClick={(e) => {
                e.stopPropagation();
                openDocPopup(page.path);
              }}
              onKeyDown={stopEditTrigger}
            >
              <FileText size={14} className={styles.docIcon} aria-hidden="true" />
              {docPageTitle(page)}
            </button>
          );
        }

        if (segment.kind === 'repo-ref') {
          // No resolution step: the project folder is not indexed, so the link
          // renders on sight and the popup is where a missing file is reported.
          return (
            <button
              key={i}
              type="button"
              className={styles.link}
              title={segment.path}
              onClick={(e) => {
                e.stopPropagation();
                openRepoFilePopup(segment.path);
              }}
              onKeyDown={stopEditTrigger}
            >
              <FileCode2 size={14} className={styles.docIcon} aria-hidden="true" />
              {segment.name}
            </button>
          );
        }

        const target = snapshot ? findTaskById(snapshot, segment.id) : null;
        if (!target) {
          return <Fragment key={i}>{segment.id}</Fragment>;
        }
        const done = isTerminalStatus(snapshot?.config, target.frontmatter.status);
        return (
          <button
            key={i}
            type="button"
            className={done ? `${styles.link} ${styles.linkDone}` : styles.link}
            onClick={(e) => {
              e.stopPropagation();
              openTask(segment.id);
            }}
            onKeyDown={stopEditTrigger}
          >
            {segment.id} {target.title}
          </button>
        );
      })}
    </>
  );
}
