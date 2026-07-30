// ============================================================
//  src/components/admin/PendingAccountsBox.jsx
//  The approval queue: every account still awaiting activation.
//  Activating one emails the user (handled server-side).
// ============================================================

import React, { useState, useEffect } from 'react';
import { fetchAdminUsers, setUserStatus } from '../../services/adminApi';
import { CheckIcon } from '../Icons';
import ConfirmActionModal from '../ConfirmActionModal';
import UserTile from './UserTile';

/**
 * @param {number}   version   - bumped by any status change elsewhere; refetches
 * @param {Function} onChanged - called after a successful activation
 */
const PendingAccountsBox = ({ version, onChanged }) => {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  // tracked separately from `loading` so a refetch holds the stale list at
  // reduced opacity instead of flashing a loading state on every change
  const [loaded, setLoaded]   = useState(false);
  const [error, setError]     = useState('');

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [saving, setSaving]               = useState(false);
  const [confirmError, setConfirmError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchAdminUsers({ status: 'pending', limit: 100 })
      .then((data) => { if (!cancelled) { setUsers(data); setLoaded(true); } })
      .catch((err) => { if (!cancelled) setError(err.message ?? 'Could not load pending accounts.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);

  const handleActivate = async () => {
    setSaving(true);
    setConfirmError('');
    try {
      await setUserStatus(confirmTarget.id, 'active');
      // drop the row locally — it no longer belongs in a pending queue
      setUsers((prev) => prev.filter((u) => u.id !== confirmTarget.id));
      setConfirmTarget(null);
      onChanged?.();
    } catch (err) {
      // keep the dialog open so the admin can read the reason and retry
      setConfirmError(err.message ?? 'Could not activate this account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-box">
      <div className="admin-box__header">
        <h2 className="admin-box__title">Pending accounts</h2>
        {loaded && <span className="admin-box__total">{users.length}</span>}
      </div>

      {!loaded && loading && <p className="admin-box__hint">Loading…</p>}
      {error && <p className="admin-box__error">{error}</p>}

      {loaded && (
        <div className={`admin-box__body${loading ? ' admin-box__body--refreshing' : ''}`}>
          {users.length === 0 ? (
            <p className="admin-box__empty">No accounts are waiting for approval.</p>
          ) : (
            <div className="admin-list">
              {users.map((u) => (
                <UserTile
                  key={u.id}
                  user={u}
                  actionLabel="Activate"
                  variant="primary"
                  icon={<CheckIcon />}
                  onAction={setConfirmTarget}
                  busy={saving && confirmTarget?.id === u.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {confirmTarget && (
        <ConfirmActionModal
          title="Activate account?"
          body={`${confirmTarget.displayName} (${confirmTarget.email}) will be able to sign in immediately, and will get an email letting them know.`}
          confirmLabel="Activate"
          variant="primary"
          loading={saving}
          error={confirmError}
          onClose={() => { setConfirmTarget(null); setConfirmError(''); }}
          onConfirm={handleActivate}
        />
      )}
    </section>
  );
};

export default PendingAccountsBox;
