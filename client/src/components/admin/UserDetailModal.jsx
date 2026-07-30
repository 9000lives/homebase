// ============================================================
//  src/components/admin/UserDetailModal.jsx
//  Account detail + status change.
//
//  Status machine: idle → choosing → saving → done
//    idle/done : shows the current status badge and a "Change" button
//    choosing  : a <select> appears; "Change" becomes "Confirm", "Cancel" appears
//    saving    : both buttons disabled, dismissal suppressed
//    done      : idle plus a success line (its own state so the message can be
//                cleared on the next "Change" without extra bookkeeping)
// ============================================================

import React, { useState, useEffect } from 'react';
import { fetchAdminUser, setUserStatus } from '../../services/adminApi';
import { useAuth } from '../../context/AuthContext';
import { formatBytes } from '../../utils/formatBytes';
import { CloseIcon } from '../Icons';
import StatusBadge from './StatusBadge';

const STATUSES = ['pending', 'active', 'suspended'];

/**
 * @param {object}   initialUser - the tile's user, so the header paints instantly
 * @param {Function} onClose
 * @param {Function} onChanged   - called after a successful status change
 */
const UserDetailModal = ({ initialUser, onClose, onChanged }) => {
  const { user: currentUser } = useAuth();

  const [user, setUser]       = useState(initialUser);
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mode, setMode]   = useState('idle');
  const [draft, setDraft] = useState(initialUser.status);
  const [status, setStatus] = useState({ type: null, text: '' });

  useEffect(() => {
    let cancelled = false;
    fetchAdminUser(initialUser.id)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setUser(data);
        setDraft(data.status);
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message ?? 'Could not load this account.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [initialUser.id]);

  // Server rejects both of these too — this is the UX hint, not the guard.
  const isSelf = user.id === currentUser?.id;
  const isAdminTarget = user.role === 'admin';
  const changeBlocked = isSelf || isAdminTarget;

  const saving = mode === 'saving';

  const handleStartChange = () => {
    setDraft(user.status);
    setStatus({ type: null, text: '' });
    setMode('choosing');
  };

  const handleConfirm = async () => {
    setMode('saving');
    setStatus({ type: null, text: '' });
    try {
      const updated = await setUserStatus(user.id, draft);
      // trust the response, not the draft
      setUser((u) => ({ ...u, status: updated.status }));
      setMode('done');
      setStatus({ type: 'success', text: `Status updated to ${updated.status}.` });
      onChanged?.();
    } catch (err) {
      // back to choosing with the draft preserved, so they can retry or cancel
      setMode('choosing');
      setStatus({ type: 'error', text: err.message ?? 'Could not update this account.' });
    }
  };

  return (
    // dismissal suppressed while saving, so a stray backdrop click can't
    // unmount this component with a request in flight
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__header">
          <span className="modal-title">{user.displayName}</span>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="admin-detail__email">{user.email}</p>

        {loadError && <p className="modal-text modal-text--error">{loadError}</p>}

        <div className="admin-detail__row">
          <div className="admin-detail__label">Storage used</div>
          <div className="admin-detail__value">
            {loading || !detail
              ? '—'
              : `${formatBytes(detail.storage.bytes)} · ${detail.storage.fileCount} ${
                  detail.storage.fileCount === 1 ? 'file' : 'files'
                }`}
          </div>
          <div className="admin-detail__sub">
            Files they own; files shared with them aren&apos;t counted.
          </div>
        </div>

        <div className="admin-detail__row">
          <div className="admin-detail__label">Account status</div>

          {mode === 'choosing' || saving ? (
            <div className="admin-detail__actions">
              <select
                className="admin-select"
                value={draft}
                disabled={saving}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setStatus({ type: null, text: '' });
                }}
                aria-label="New account status"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="button"
                className="modal-button modal-button--primary"
                onClick={handleConfirm}
                // no request for a no-op
                disabled={saving || draft === user.status}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
              <button
                type="button"
                className="modal-button modal-button--ghost"
                onClick={() => { setMode('idle'); setStatus({ type: null, text: '' }); }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="admin-detail__actions">
              <StatusBadge status={user.status} />
              <button
                type="button"
                className="modal-button modal-button--ghost"
                onClick={handleStartChange}
                disabled={changeBlocked}
              >
                Change
              </button>
            </div>
          )}

          {changeBlocked && (
            <div className="admin-detail__sub">
              {isSelf
                ? "You can't change your own account status."
                : 'Admin accounts can only be changed directly in the database.'}
            </div>
          )}
        </div>

        {status.text && (
          <p className={`modal-text modal-text--${status.type}`}>{status.text}</p>
        )}
      </div>
    </div>
  );
};

export default UserDetailModal;
