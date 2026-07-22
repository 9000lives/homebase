// ============================================================
//  src/components/settings/ChangeUsernameModal.jsx
//  Triggered from the Account section's "Change Username" button.
// ============================================================

import React from 'react';
import { CloseIcon } from '../Icons';
import ChangeUsernameForm from './ChangeUsernameForm';

/**
 * @param {Function} onClose - called to dismiss the modal
 */
const ChangeUsernameModal = ({ onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2 className="modal-title">Change username</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <ChangeUsernameForm onSuccess={() => setTimeout(onClose, 900)} />
      </div>
    </div>
  );
};

export default ChangeUsernameModal;
