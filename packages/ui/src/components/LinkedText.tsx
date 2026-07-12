import { Fragment, type KeyboardEvent } from 'react';
import { useBoardStore } from '../store';
import { findTaskById } from '../utils/find-task';
import { splitTaskRefs } from '../utils/task-refs';
import styles from './LinkedText.module.css';

interface LinkedTextProps {
  text: string;
}

export function LinkedText({ text }: LinkedTextProps) {
  const snapshot = useBoardStore((s) => s.snapshot);
  const openTask = useBoardStore((s) => s.openTask);

  const segments = splitTaskRefs(text);

  // The surrounding InlineEditText view is a role="button" that enters edit mode
  // on click and on Enter/Space; a link must shield both so activating it does
  // not also open the editor.
  const stopEditTrigger = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.kind === 'text') {
          return <Fragment key={i}>{segment.text}</Fragment>;
        }
        const target = snapshot ? findTaskById(snapshot, segment.id) : null;
        if (!target) {
          return <Fragment key={i}>{segment.id}</Fragment>;
        }
        return (
          <button
            key={i}
            type="button"
            className={styles.link}
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
