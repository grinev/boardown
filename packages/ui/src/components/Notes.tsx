import { Trash2 } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { nextNoteId, type Note, type Task } from '@boardown/core';
import { useDocRefSuggestions } from '../hooks/use-doc-ref-suggestions';
import { DocRefSuggestions } from './DocRefSuggestions';
import { InlineEditText } from './InlineEditText';
import { LinkedText } from './LinkedText';
import styles from './Notes.module.css';

interface NotesProps {
  task: Task;
  onChange: (notes: Note[]) => void | Promise<void>;
}

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

export function Notes({ task, onChange }: NotesProps) {
  const notes = task.frontmatter.notes ?? [];

  const editText = (id: string, text: string): Promise<void> =>
    Promise.resolve(
      onChange(notes.map((n) => (n.id === id ? { ...n, text } : n))),
    );

  const remove = (id: string) => {
    void onChange(notes.filter((n) => n.id !== id));
  };

  const add = (text: string) => {
    void onChange([
      ...notes,
      { id: nextNoteId(notes), text, createdAt: new Date().toISOString() },
    ]);
  };

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h3 className={styles.headingText}>Notes</h3>
        {notes.length > 0 && <span className={styles.count}>{notes.length}</span>}
      </div>
      {notes.length > 0 && (
        <ul className={styles.list}>
          {notes.map((note) => (
            <li key={note.id} className={styles.row}>
              <div className={styles.noteHead}>
                <time className={styles.date} dateTime={note.createdAt}>
                  {formatDate(note.createdAt)}
                </time>
                <button
                  type="button"
                  className={styles.deleteButton}
                  aria-label="Delete note"
                  onClick={() => remove(note.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              <InlineEditText
                value={note.text}
                multiline
                required
                ariaLabel="Note text"
                className={styles.noteText}
                renderView={(value) => <LinkedText text={value} />}
                onSave={(next) => editText(note.id, next)}
              />
            </li>
          ))}
        </ul>
      )}
      <AddNote onAdd={add} />
    </section>
  );
}

interface AddNoteProps {
  onAdd: (text: string) => void;
}

function AddNote({ onAdd }: AddNoteProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const suggestions = useDocRefSuggestions(textareaRef, text, setText);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onAdd(trimmed);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.onKeyDown(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setText('');
    }
  };

  return (
    <div className={styles.addRow}>
      <>
        <textarea
          ref={textareaRef}
          className={styles.addInput}
          value={text}
          placeholder="Add a note"
          aria-label="Add note"
          rows={2}
          onChange={(e) => {
            setText(e.target.value);
            suggestions.sync();
          }}
          onSelect={suggestions.sync}
          onKeyDown={onKeyDown}
          // Picking a row keeps focus (the popup swallows mousedown), so a real
          // blur means the caret is gone and the popup is stale.
          onBlur={suggestions.close}
        />
        <DocRefSuggestions suggestions={suggestions} />
      </>
      <button
        type="button"
        className={styles.addButton}
        disabled={text.trim() === ''}
        onClick={commit}
      >
        Add
      </button>
    </div>
  );
}
