// ============================================================
//  src/components/ShareModal.jsx
//  Triggered by the "Share" button in PreviewModal (files) or the
//  "Share" item in a folder tile's kebab menu (folders).
//  Searches active users by email/displayName (debounced) and lets
//  the item's owner share/unshare it with them. Sharing a folder shares
//  everything inside it (live), so folders show a warning step first.
// ============================================================

import React, { useState, useEffect } from 'react';
import { searchUsers } from '../services/usersApi';
import { shareFile, unshareFile, shareFolder, unshareFolder } from '../services/filesApi';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ShareIcon, CheckIcon } from './Icons';
import Modal from './Modal';

/**
 * @param {object}   item          - the file or folder being shared, { _id, name, type }
 * @param {Function} onClose       - called to dismiss the modal
 * @param {Function} [onShareChange] - called after a share/unshare succeeds
 */
const ShareModal = ({ item, onClose, onShareChange }) => {
  const isFolder = item.type === 'folder';
  const shareFn = isFolder ? shareFolder : shareFile;
  const unshareFn = isFolder ? unshareFolder : unshareFile;

  // Folders share everything inside them, so show a warning before the
  // search UI; files skip straight to search.
  const [step, setStep] = useState(isFolder ? 'warning' : 'search');
  const [query, setQuery]                 = useState('');
  const [debouncedQuery]                  = useDebouncedValue(query.trim(), 500);
  const [results, setResults]             = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [pendingUserId, setPendingUserId] = useState(null);

  // Fire the search once the debounced query settles (only once the warning
  // step, if any, has been dismissed).
  useEffect(() => {
    if (step !== 'search' || !debouncedQuery) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    searchUsers(debouncedQuery, isFolder ? { folderId: item._id } : { fileId: item._id })
      .then((data) => { if (!cancelled) setResults(data); })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Search failed.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [step, debouncedQuery, isFolder, item._id]);

  const handleToggleShare = async (targetUser) => {
    setPendingUserId(targetUser.id);
    try {
      if (targetUser.isShared) {
        await unshareFn(item._id, targetUser.id);
      } else {
        await shareFn(item._id, targetUser.id);
      }
      setResults((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, isShared: !u.isShared } : u))
      );
      onShareChange?.();
    } catch (err) {
      setError(err.message ?? 'Could not update sharing.');
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <Modal title={`Share "${item.name}"`} onClose={onClose} wide showClose truncateTitle>
      {step === 'warning' ? (
        <>
          <p className="modal-text">
            Sharing this folder will share everything inside it — including files and
            subfolders added later — with the recipient.
          </p>
          <div className="modal-actions">
            <button type="button" className="modal-button modal-button--ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="modal-button modal-button--primary"
              onClick={() => setStep('search')}
            >
              Continue
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="share-search">Search by name or email</label>
            <input
              id="share-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing…"
              autoFocus
            />
          </div>

          {error && <p className="modal-text modal-text--error" role="alert">{error}</p>}

          <div className="share-results">
            {loading && <p className="modal-text">Searching…</p>}
            {!loading && debouncedQuery && results.length === 0 && (
              <p className="modal-text">No matching users.</p>
            )}
            {!loading && results.map((u) => (
              <div key={u.id} className="share-user-tile">
                <div className="share-user-tile__info">
                  <span className="share-user-tile__name">{u.displayName}</span>
                  <span className="share-user-tile__email">{u.email}</span>
                </div>
                <button
                  type="button"
                  className={`modal-button ${u.isShared ? 'modal-button--ghost' : 'modal-button--primary'} share-user-tile__button`}
                  disabled={pendingUserId === u.id}
                  onClick={() => handleToggleShare(u)}
                >
                  {u.isShared ? (<><CheckIcon /> Shared</>) : (<><ShareIcon /> Share</>)}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
};

export default ShareModal;
