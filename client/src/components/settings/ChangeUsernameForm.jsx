// ============================================================
//  src/components/settings/ChangeUsernameForm.jsx
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { changeUsername } from '../../services/authApi';
import FormStatus from '../FormStatus';
import { useFormStatus } from '../../hooks/useFormStatus';

const ChangeUsernameForm = ({ onSuccess }) => {
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [password, setPassword] = useState('');
  const { status, setSuccess, setError: setStatusError, clear: clearStatus } = useFormStatus();
  const [loading, setLoading] = useState(false);

  const trimmedName = displayName.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName !== user?.displayName && password.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    clearStatus();
    try {
      await changeUsername(password, trimmedName);
      await refreshUser();
      setPassword('');
      setSuccess('Username updated.');
      onSuccess?.();
    } catch (err) {
      setStatusError(err.message ?? 'Could not update username. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="settings-username">Username</label>
        <input
          id="settings-username"
          type="text"
          value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); clearStatus(); }}
          disabled={loading}
        />
      </div>
      <div className="form-group">
        <label htmlFor="settings-username-password">Current password</label>
        <input
          id="settings-username-password"
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); clearStatus(); }}
          autoComplete="current-password"
          disabled={loading}
        />
      </div>

      <FormStatus status={status} />

      <div className="modal-actions">
        <button type="submit" className="modal-button modal-button--primary" disabled={loading || !canSubmit}>
          {loading ? 'Saving…' : 'Save username'}
        </button>
      </div>
    </form>
  );
};

export default ChangeUsernameForm;
