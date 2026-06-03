import { useState, type FormEvent } from 'react';
import { ID_PREFIX_REGEX } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './OnboardingDialog.module.css';

const noop = () => {};

export function OnboardingDialog() {
  const completeOnboarding = useBoardStore((s) => s.completeOnboarding);

  const [projectName, setProjectName] = useState('');
  const [idPrefix, setIdPrefix] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmedName = projectName.trim();
  const prefixTouched = idPrefix.length > 0;
  const prefixValid = ID_PREFIX_REGEX.test(idPrefix);

  const canSubmit = trimmedName.length > 0 && prefixValid && !submitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await completeOnboarding({ projectName: trimmedName, idPrefix });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message);
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={noop}
      ariaLabel="Welcome to Boardown"
      className={styles.dialog}
      dismissable={false}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Welcome to Boardown</h2>
      </header>
      <form className={styles.form} onSubmit={(e) => void handleSubmit(e)}>
        <p className={styles.intro}>
          Tell Boardown about your project. These settings will be saved to{' '}
          <code>.boardown/config.yaml</code> and can be changed later.
        </p>
        <label className={styles.field}>
          <span className={styles.label}>Project name</span>
          <input
            type="text"
            className={styles.input}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="My Project"
            autoFocus
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>ID prefix</span>
          <input
            type="text"
            className={styles.input}
            value={idPrefix}
            onChange={(e) => setIdPrefix(e.target.value)}
            placeholder="BD"
            required
            aria-invalid={prefixTouched && !prefixValid}
          />
          {prefixTouched && !prefixValid ? (
            <span className={styles.fieldError} role="alert">
              2–5 uppercase letters (A–Z)
            </span>
          ) : (
            <span className={styles.hint}>
              Used in task IDs, e.g. <code>BD-1</code>, <code>TASK-42</code>.
            </span>
          )}
        </label>
        {submitError !== null && (
          <p className={styles.error} role="alert">
            {submitError}
          </p>
        )}
        <footer className={styles.footer}>
          <button type="submit" className={styles.createButton} disabled={!canSubmit}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
