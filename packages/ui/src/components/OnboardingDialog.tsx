import { useState, type FormEvent } from 'react';
import { ID_PREFIX_REGEX } from '@boardown/core';
import { useBoardStore } from '../store';
import { Modal } from './Modal';
import styles from './OnboardingDialog.module.css';

const noop = () => {};

interface OnboardingDialogProps {
  // Host-provided seeds (e.g. derived from the opened folder); empty when the
  // shell has no hint to offer.
  defaultProjectName?: string;
  defaultIdPrefix?: string;
  // When provided, the form can be cancelled (button + ESC/backdrop) instead of
  // being a required first step — used by shells where there is somewhere to go
  // back to (e.g. the desktop sidebar). Omitted by web/vscode, where the board
  // is the whole window and onboarding is mandatory.
  onCancel?: () => void;
}

export function OnboardingDialog({
  defaultProjectName,
  defaultIdPrefix,
  onCancel,
}: OnboardingDialogProps) {
  const completeOnboarding = useBoardStore((s) => s.completeOnboarding);

  const [projectName, setProjectName] = useState(defaultProjectName ?? '');
  const [idPrefix, setIdPrefix] = useState(defaultIdPrefix ?? '');
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
      onClose={onCancel ?? noop}
      ariaLabel="Welcome to Boardown"
      className={styles.dialog}
      dismissable={onCancel !== undefined}
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
          {onCancel && (
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </button>
          )}
          <button type="submit" className={styles.createButton} disabled={!canSubmit}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
