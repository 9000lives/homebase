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
import {
  fetchAdminUser,
  setUserStatus,
  revokeUserSessions,
  resetUserTwoFactor,
  deleteUser,
} from '../../services/adminApi';
import { useAuth } from '../../context/AuthContext';
import { formatBytes } from '../../utils/formatBytes';
import { useFormStatus } from '../../hooks/useFormStatus';
import Modal from '../Modal';
import StatusBadge from './StatusBadge';
import FormStatus from '../FormStatus';
import ConfirmActionModal from '../ConfirmActionModal';

const STATUSES = ['pending', 'active', 'suspended'];

/**
 * @param {object}   initialUser - the tile's user, so the header paints instantly
 * @param {Function} onClose
 * @param {Function} onChanged   - called after any successful mutation
 */
const UserDetailModal = ({ initialUser, onClose, onChanged }) => {
  const { user: currentUser } = useAuth();

  const [user, setUser]       = useState(initialUser);
  const [detail, setDetail]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mode, setMode]   = useState('idle');
  const [draft, setDraft] = useState(initialUser.status);
  const { status, setSuccess, setError: setStatusError, clear: clearStatus } = useFormStatus();

  // Support actions. One pending-action key drives a single ConfirmActionModal
  // rather than three near-identical dialogs.
  const [pendingAction, setPendingAction] = useState(null);   // 'revoke' | 'reset2fa' | 'delete'
  const [actionBusy, setActionBusy]       = useState(false);
  const [actionError, setActionError]     = useState('');
  const [confirmEmail, setConfirmEmail]   = useState('');

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
    clearStatus();
    setMode('choosing');
  };

  const handleConfirm = async () => {
    setMode('saving');
    clearStatus();
    try {
      const updated = await setUserStatus(user.id, draft);
      // trust the response, not the draft
      setUser((u) => ({ ...u, status: updated.status }));
      setMode('done');
      setSuccess(`Status updated to ${updated.status}.`);
      onChanged?.();
    } catch (err) {
      // back to choosing with the draft preserved, so they can retry or cancel
      setMode('choosing');
      setStatusError(err.message ?? 'Could not update this account.');
    }
  };

  const closeAction = () => {
    setPendingAction(null);
    setActionError('');
    setConfirmEmail('');
  };

  const runAction = async (fn, successText, { closeOnSuccess = false } = {}) => {
    setActionBusy(true);
    setActionError('');
    try {
      await fn();
      onChanged?.();
      if (closeOnSuccess) {
        onClose();
        return;
      }
      closeAction();
      setSuccess(successText);
    } catch (err) {
      // Dialog stays open with the server's reason, matching how the status
      // change and the pending-queue activation both handle failure.
      setActionError(err.message ?? 'Could not complete this action.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRevoke = () =>
    runAction(
      () => revokeUserSessions(user.id),
      'Signed out of all devices.'
    );

  const handleReset2fa = () =>
    runAction(
      async () => {
        const updated = await resetUserTwoFactor(user.id);
        setDetail((d) => (d ? { ...d, twoFactorEnabled: updated.twoFactorEnabled } : d));
      },
      'Two-factor authentication turned off. They have been emailed.'
    );

  const handleDelete = () =>
    runAction(
      () => deleteUser(user.id, confirmEmail),
      '',
      // Nothing left to show once the account is gone.
      { closeOnSuccess: true }
    );

  // Mirrors the server's check so the button doesn't arm until the address
  // matches. The server re-checks it — this is the UX half.
  const deleteArmed = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();

  const ACTION_DIALOGS = {
    revoke: {
      title: 'Sign out of all devices?',
      body: `${user.displayName} will be signed out everywhere and will have to enter their password again. This device will also have to pass a two-factor challenge next time. Their account stays active.`,
      confirmLabel: 'Sign out everywhere',
      variant: 'primary',
      onConfirm: handleRevoke,
    },
    reset2fa: {
      title: 'Turn off two-factor authentication?',
      body: `${user.displayName} will be able to sign in with just their password, and will be signed out of all devices. They'll get an email telling them this happened. Use this when someone has lost access to their email.`,
      confirmLabel: 'Turn off 2FA',
      variant: 'primary',
      onConfirm: handleReset2fa,
    },
    delete: {
      title: 'Delete this account?',
      body: (
        <>
          <span className="admin-danger__lede">
            This permanently deletes {user.displayName}, {detail
              ? `their ${detail.storage.fileCount} ${detail.storage.fileCount === 1 ? 'file' : 'files'} (${formatBytes(detail.storage.bytes)})`
              : 'all their files'}, and every folder they own. It cannot be undone.
          </span>
          <label className="admin-danger__label" htmlFor="confirm-delete-email">
            Type <strong>{user.email}</strong> to confirm
          </label>
          <input
            id="confirm-delete-email"
            className="admin-danger__input"
            type="text"
            value={confirmEmail}
            autoComplete="off"
            disabled={actionBusy}
            onChange={(e) => setConfirmEmail(e.target.value)}
          />
        </>
      ),
      confirmLabel: 'Delete account',
      variant: 'danger',
      confirmDisabled: !deleteArmed,
      onConfirm: handleDelete,
    },
  };

  const dialog = pendingAction ? ACTION_DIALOGS[pendingAction] : null;

  return (
    // The confirm dialog is a SIBLING of this overlay, not a child — nested
    // inside it, a click on the inner backdrop would bubble to the outer
    // overlay's onClick and dismiss this modal too. PreviewModal stacks
    // ShareModal the same way.
    <>
    {/* dismissal suppressed while saving, so neither a stray backdrop click nor
        Escape can unmount this component with a request in flight */}
    <Modal
      title={user.displayName}
      onClose={onClose}
      wide
      showClose
      truncateTitle
      dismissible={!saving}
    >
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
          <div className="admin-detail__label">Two-factor</div>
          <div className="admin-detail__value">
            {loading || !detail ? '—' : detail.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
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
                  clearStatus();
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
                onClick={() => { setMode('idle'); clearStatus(); }}
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

          {/* Covers the actions row below as well as this one — the server
              refuses both for the same two reasons. */}
          {changeBlocked && (
            <div className="admin-detail__sub">
              {isSelf
                ? "You can't change or act on your own account here."
                : 'Admin accounts can only be changed directly in the database.'}
            </div>
          )}
        </div>

        <div className="admin-detail__row">
          <div className="admin-detail__label">Account actions</div>
          <div className="admin-detail__actions admin-detail__actions--wrap">
            <button
              type="button"
              className="modal-button modal-button--ghost"
              onClick={() => setPendingAction('revoke')}
              disabled={changeBlocked}
            >
              Sign out everywhere
            </button>
            <button
              type="button"
              className="modal-button modal-button--ghost"
              onClick={() => setPendingAction('reset2fa')}
              // Nothing to reset if it was never on.
              disabled={changeBlocked || !detail?.twoFactorEnabled}
            >
              Reset 2FA
            </button>
            <button
              type="button"
              className="modal-button modal-button--danger"
              onClick={() => setPendingAction('delete')}
              disabled={changeBlocked}
            >
              Delete account
            </button>
          </div>
          {/* No blocked-reason line here: the identical explanation already
              renders one row up under Account status, and repeating it reads
              as two separate problems. */}
        </div>

        <FormStatus status={status} />
    </Modal>

    {dialog && (
      <ConfirmActionModal
        title={dialog.title}
        body={dialog.body}
        confirmLabel={dialog.confirmLabel}
        variant={dialog.variant}
        confirmDisabled={dialog.confirmDisabled ?? false}
        loading={actionBusy}
        error={actionError}
        onClose={closeAction}
        onConfirm={dialog.onConfirm}
      />
    )}
    </>
  );
};

export default UserDetailModal;
