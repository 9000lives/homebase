// ============================================================
//  src/components/ConfirmActionModal.jsx
//  Generic confirmation dialog. ConfirmDeleteModal stays as-is — its copy
//  is hardcoded to file/folder deletion, and generalising it would churn
//  the Dashboard delete path for no gain.
//
//  Matches the repo's modal shape (no portal, no focus trap) for
//  consistency; adding Escape handling + a focus trap is a follow-up
//  pass across all modals at once.
// ============================================================

import React from 'react';

/**
 * @param {string}   title          - dialog heading
 * @param {node}     body           - explanatory copy
 * @param {string}   [confirmLabel] - confirm button text
 * @param {string}   [cancelLabel]  - cancel button text
 * @param {string}   [variant]      - confirm button variant: 'primary' | 'danger'
 * @param {boolean}  [loading]      - disables both buttons and blocks dismissal
 * @param {boolean}  [confirmDisabled] - holds the confirm button closed while the
 *                                    dialog's own precondition is unmet (e.g. the
 *                                    typed-email check on account deletion).
 *                                    Separate from `loading` so the button reads
 *                                    "Delete" rather than "Working…" while waiting.
 * @param {string}   [error]        - error message to show inside the dialog
 * @param {Function} onClose        - dismiss without acting
 * @param {Function} onConfirm      - perform the action
 */
const ConfirmActionModal = ({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  confirmDisabled = false,
  error = '',
  onClose,
  onConfirm,
}) => (
  // Backdrop dismissal is suppressed while a request is in flight, so a stray
  // click can't unmount a component mid-request.
  <div className="modal-overlay" onClick={loading ? undefined : onClose}>
    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
      <h2 className="modal-title">{title}</h2>
      <div className="modal-text">{body}</div>

      {error && <p className="modal-text modal-text--error">{error}</p>}

      <div className="modal-actions">
        <button
          type="button"
          className="modal-button modal-button--ghost"
          onClick={onClose}
          disabled={loading}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`modal-button modal-button--${variant}`}
          onClick={onConfirm}
          disabled={loading || confirmDisabled}
        >
          {loading ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

export default ConfirmActionModal;
