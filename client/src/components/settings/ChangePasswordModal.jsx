// ============================================================
//  src/components/settings/ChangePasswordModal.jsx
//  Triggered from the Security section's "Change Password" button.
// ============================================================

import React from 'react';
import { CloseIcon } from '../Icons';
import ChangePasswordForm from './ChangePasswordForm';

/**
 * @param {Function} onClose - called to dismiss the modal
 */
const ChangePasswordModal = ({ onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <h2 className="modal-title">Change password</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <ChangePasswordForm onSuccess={() => setTimeout(onClose, 900)} />
      </div>
    </div>
  );
};

export default ChangePasswordModal;
