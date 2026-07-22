import { Plus, Trash2 } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { nextChecklistItemId, type ChecklistItem, type Task } from '@boardown/core';
import { InlineEditText } from './InlineEditText';
import styles from './Checklist.module.css';

interface ChecklistProps {
  task: Task;
  // The task lives in a finished release: items are visible but frozen.
  readOnly: boolean;
  onChange: (items: ChecklistItem[]) => void | Promise<void>;
}

export function Checklist({ task, readOnly, onChange }: ChecklistProps) {
  const items = task.frontmatter.checklist ?? [];
  const doneCount = items.filter((it) => it.done).length;

  const toggle = (id: string) => {
    void onChange(
      items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)),
    );
  };

  const editText = (id: string, text: string): Promise<void> =>
    Promise.resolve(
      onChange(items.map((it) => (it.id === id ? { ...it, text } : it))),
    );

  const remove = (id: string) => {
    void onChange(items.filter((it) => it.id !== id));
  };

  const add = (text: string) => {
    void onChange([
      ...items,
      { id: nextChecklistItemId(items), text, done: false },
    ]);
  };

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h3 className={styles.headingText}>Checklist</h3>
        {items.length > 0 && (
          <span className={styles.count}>
            {doneCount}/{items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.row}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={item.done}
                disabled={readOnly}
                aria-label="Toggle checklist item"
                onChange={() => toggle(item.id)}
              />
              <div className={styles.itemTextWrap}>
                <InlineEditText
                  value={item.text}
                  required
                  readOnly={readOnly}
                  ariaLabel="Checklist item"
                  className={`${styles.itemText} ${item.done ? styles.itemTextDone : ''}`}
                  onSave={(next) => editText(item.id, next)}
                />
              </div>
              {!readOnly && (
                <button
                  type="button"
                  className={styles.deleteButton}
                  aria-label="Delete checklist item"
                  onClick={() => remove(item.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && <AddItem onAdd={add} />}
    </section>
  );
}

interface AddItemProps {
  onAdd: (text: string) => void;
}

function AddItem({ onAdd }: AddItemProps) {
  const [text, setText] = useState('');

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onAdd(trimmed);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setText('');
    }
  };

  return (
    <div className={styles.addRow}>
      <Plus size={14} className={styles.addIcon} aria-hidden="true" />
      <input
        type="text"
        className={styles.addInput}
        value={text}
        placeholder="Add item"
        aria-label="Add checklist item"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  );
}
