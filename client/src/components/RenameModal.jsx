// ============================================================
//  src/components/RenameModal.jsx
//  Triggered from a FileTile's kebab menu.
// ============================================================

import React, { useState } from 'react';
import Modal from './Modal';

/**
 * @param {object}   item     - { _id, name, type: 'folder' | 'file' }
 * @param {Function} onClose  - called to dismiss the modal
 * @param {Function} onSubmit - called with (newName) when submitted
 * @param {boolean}  loading  - disables the form while a request is in flight
 */
const RenameModal = ({ item, onClose, onSubmit, loading }) => {
  const [name, setName] = useState(item.name);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && trimmed !== item.name;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <Modal
      title={`Rename ${item.type === 'folder' ? 'folder' : 'file'}`}
      onClose={onClose}
      dismissible={!loading}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="rename-input">Name</label>
          <input
            id="rename-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
            disabled={loading}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="modal-button modal-button--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="modal-button modal-button--primary" disabled={loading || !canSubmit}>
            {loading ? 'Renaming…' : 'Rename'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default RenameModal;
