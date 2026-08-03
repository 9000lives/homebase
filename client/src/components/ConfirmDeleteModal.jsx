// ============================================================
//  src/components/ConfirmDeleteModal.jsx
//  Triggered from a FileTile's kebab menu. Reused for both
//  files and folders — folders warn that delete is recursive.
// ============================================================

import React from 'react';
import Modal from './Modal';

/**
 * @param {object}   item      - { _id, name, type: 'folder' | 'file' }
 * @param {Function} onClose   - called to dismiss the modal
 * @param {Function} onConfirm - called when the delete is confirmed
 * @param {boolean}  loading   - disables the buttons while a request is in flight
 */
const ConfirmDeleteModal = ({ item, onClose, onConfirm, loading }) => (
  // Dismissal suppressed while the delete is in flight, so neither a stray
  // backdrop click nor Escape can unmount this mid-request.
  <Modal
    title={`Delete ${item.type === 'folder' ? 'folder' : 'file'}?`}
    onClose={onClose}
    dismissible={!loading}
  >
    <p className="modal-text">
      {item.type === 'folder'
        ? `"${item.name}" and everything inside it will be permanently deleted. This can't be undone.`
        : `"${item.name}" will be permanently deleted. This can't be undone.`}
    </p>
    <div className="modal-actions">
      <button type="button" className="modal-button modal-button--ghost" onClick={onClose} disabled={loading}>
        Cancel
      </button>
      <button type="button" className="modal-button modal-button--danger" onClick={onConfirm} disabled={loading}>
        {loading ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  </Modal>
);

export default ConfirmDeleteModal;
