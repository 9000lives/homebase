// ============================================================
//  src/components/NewItemModal.jsx
//  Triggered by the header's "+ New" button.
//  - Folder tab: name input, creates via JSON POST
//  - File tab:   native file picker, uploads via multipart POST
// ============================================================

import React, { useState } from 'react';

/**
 * @param {Function} onClose         - called to dismiss the modal
 * @param {Function} onCreateFolder  - called with (name) when a folder is submitted
 * @param {Function} onUploadFile    - called with (file) when a file is submitted
 * @param {boolean}  loading         - disables the form while a request is in flight
 */
const NewItemModal = ({ onClose, onCreateFolder, onUploadFile, loading }) => {
  const [type, setType]           = useState('folder');
  const [folderName, setFolderName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (type === 'folder') {
      if (!folderName.trim()) return;
      onCreateFolder(folderName.trim());
    } else {
      if (!selectedFile) return;
      onUploadFile(selectedFile);
    }
  };

  const canSubmit = type === 'folder' ? folderName.trim().length > 0 : !!selectedFile;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">New item</h2>

        <div className="modal-type-toggle">
          <button
            type="button"
            className={`modal-type-toggle__btn${type === 'folder' ? ' modal-type-toggle__btn--active' : ''}`}
            onClick={() => setType('folder')}
          >
            Folder
          </button>
          <button
            type="button"
            className={`modal-type-toggle__btn${type === 'file' ? ' modal-type-toggle__btn--active' : ''}`}
            onClick={() => setType('file')}
          >
            File
          </button>
        </div>

        <form onSubmit={handleSubmit}>

          {type === 'folder' ? (
            <div className="form-group">
              <label htmlFor="folder-name">Name</label>
              <input
                id="folder-name"
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="New folder"
                autoFocus
                required
                disabled={loading}
              />
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="file-upload">Choose a file</label>
              <label
                htmlFor="file-upload"
                className={`file-picker${selectedFile ? ' file-picker--selected' : ''}`}
              >
                {selectedFile ? selectedFile.name : 'Click to browse…'}
              </label>
              <input
                id="file-upload"
                type="file"
                onChange={(e) => setSelectedFile(e.target.files[0] ?? null)}
                disabled={loading}
                style={{ display: 'none' }}
              />
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="modal-button modal-button--ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="modal-button modal-button--primary" disabled={loading || !canSubmit}>
              {loading
                ? (type === 'folder' ? 'Creating…' : 'Uploading…')
                : (type === 'folder' ? 'Create' : 'Upload')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewItemModal;
