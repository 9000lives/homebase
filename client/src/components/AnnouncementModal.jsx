// ============================================================
//  src/components/AnnouncementModal.jsx
//  Shows unseen announcements one at a time. Mounted by
//  AnnouncementGate, which owns the fetching and the dismissal call.
//
//  Matches the repo's modal shape (no portal, no focus trap) for
//  consistency with the other nine — see ConfirmActionModal for the
//  note on that deferred follow-up.
// ============================================================

import React, { useState } from 'react';

const formatSentAt = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * @param {Array}    announcements - [{ id, title, body, createdAt }], newest first
 * @param {Function} onDismiss     - called once, after the last one is acknowledged
 */
const AnnouncementModal = ({ announcements, onDismiss }) => {
  const [index, setIndex] = useState(0);

  const current = announcements[index];
  const isLast  = index === announcements.length - 1;

  if (!current) return null;

  const handleNext = () => {
    if (isLast) onDismiss();
    else setIndex((i) => i + 1);
  };

  return (
    // No backdrop dismissal. Stepping through with the button is the only exit,
    // so a stray click can't skip an unread announcement and mark it seen.
    <div className="modal-overlay">
      <div className="modal-card">
        <h2 className="modal-title">{current.title}</h2>

        <p className="announcement-modal__sent">{formatSentAt(current.createdAt)}</p>

        {/* Rendered as text, never as HTML. An admin-authored announcement
            reaches every member's browser, so this is the one place where an
            innerHTML shortcut would turn the broadcast channel into stored XSS. */}
        <p className="modal-text announcement-modal__body">{current.body}</p>

        <div className="modal-actions">
          {announcements.length > 1 && (
            <span className="announcement-modal__counter">
              {index + 1} of {announcements.length}
            </span>
          )}
          <button
            type="button"
            className="modal-button modal-button--primary"
            onClick={handleNext}
          >
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementModal;
