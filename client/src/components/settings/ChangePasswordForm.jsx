// ============================================================
//  src/components/settings/ChangePasswordForm.jsx
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  changePassword,
  requestPasswordChangeCode,
  confirmPasswordChangeWithCode,
} from '../../services/authApi';
import FormStatus from '../FormStatus';
import { useFormStatus } from '../../hooks/useFormStatus';

const NoTwoFactorForm = ({ onSuccess }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const { status, setSuccess, setError: setStatusError, clear: clearStatus } = useFormStatus();
  const [loading, setLoading] = useState(false);

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    newPassword === confirmNewPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    clearStatus();
    try {
      await changePassword(currentPassword, newPassword, confirmNewPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccess('Password updated.');
      onSuccess?.();
    } catch (err) {
      setStatusError(err.message ?? 'Could not update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => { setCurrentPassword(e.target.value); clearStatus(); }}
          autoComplete="current-password"
          disabled={loading}
        />
      </div>
      <div className="form-group">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => { setNewPassword(e.target.value); clearStatus(); }}
          autoComplete="new-password"
          disabled={loading}
        />
      </div>
      <div className="form-group">
        <label htmlFor="confirm-new-password">Confirm new password</label>
        <input
          id="confirm-new-password"
          type="password"
          value={confirmNewPassword}
          onChange={(e) => { setConfirmNewPassword(e.target.value); clearStatus(); }}
          autoComplete="new-password"
          disabled={loading}
        />
      </div>

      <FormStatus status={status} />

      <div className="modal-actions">
        <button type="submit" className="modal-button modal-button--primary" disabled={loading || !canSubmit}>
          {loading ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
};

const TwoFactorPasswordForm = ({ onSuccess }) => {
  const [step, setStep] = useState('idle'); // 'idle' | 'awaiting-code'
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const { status, setSuccess, setError: setStatusError, clear: clearStatus } = useFormStatus();
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    setLoading(true);
    clearStatus();
    try {
      await requestPasswordChangeCode();
      setStep('awaiting-code');
      setSuccess('Verification code sent to your email.');
    } catch (err) {
      setStatusError(err.message ?? 'Could not send a verification code.');
    } finally {
      setLoading(false);
    }
  };

  const canConfirm = code.length > 0 && newPassword.length > 0 && newPassword === confirmNewPassword;

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!canConfirm) return;
    setLoading(true);
    clearStatus();
    try {
      await confirmPasswordChangeWithCode(code, newPassword, confirmNewPassword);
      setStep('idle');
      setCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSuccess('Password updated.');
      onSuccess?.();
    } catch (err) {
      setStatusError(err.message ?? 'Could not update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'idle') {
    return (
      <div className="settings-form">
        <p className="modal-text">
          2FA is enabled — changing your password requires a verification code instead of your old password.
        </p>
        <FormStatus status={status} />
        <div className="modal-actions">
          <button
            type="button"
            className="modal-button modal-button--primary"
            onClick={handleSendCode}
            disabled={loading}
          >
            {loading ? 'Sending…' : 'Send verification code'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="settings-form" onSubmit={handleConfirm}>
      <div className="form-group">
        <label htmlFor="password-2fa-code">Verification code</label>
        <input
          id="password-2fa-code"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => { setCode(e.target.value); clearStatus(); }}
          autoFocus
          disabled={loading}
        />
      </div>
      <div className="form-group">
        <label htmlFor="password-2fa-new">New password</label>
        <input
          id="password-2fa-new"
          type="password"
          value={newPassword}
          onChange={(e) => { setNewPassword(e.target.value); clearStatus(); }}
          autoComplete="new-password"
          disabled={loading}
        />
      </div>
      <div className="form-group">
        <label htmlFor="password-2fa-confirm">Confirm new password</label>
        <input
          id="password-2fa-confirm"
          type="password"
          value={confirmNewPassword}
          onChange={(e) => { setConfirmNewPassword(e.target.value); clearStatus(); }}
          autoComplete="new-password"
          disabled={loading}
        />
      </div>

      <FormStatus status={status} />

      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--ghost" onClick={handleSendCode} disabled={loading}>
          Resend code
        </button>
        <button type="submit" className="modal-button modal-button--primary" disabled={loading || !canConfirm}>
          {loading ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
};

const ChangePasswordForm = ({ onSuccess }) => {
  const { user } = useAuth();
  return user?.twoFactorEnabled ? (
    <TwoFactorPasswordForm onSuccess={onSuccess} />
  ) : (
    <NoTwoFactorForm onSuccess={onSuccess} />
  );
};

export default ChangePasswordForm;
