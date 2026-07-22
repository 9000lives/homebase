// ============================================================
//  src/components/settings/TwoFactorSection.jsx
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { requestEnable2FA, confirmEnable2FA, disable2FA } from '../../services/authApi';

const EnableTwoFactor = () => {
  const { refreshUser } = useAuth();
  const [step, setStep] = useState('idle'); // 'idle' | 'awaiting-code'
  const [code, setCode] = useState('');
  const [status, setStatus] = useState({ type: null, text: '' });
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    setLoading(true);
    setStatus({ type: null, text: '' });
    try {
      await requestEnable2FA();
      setStep('awaiting-code');
      setStatus({ type: 'success', text: 'Verification code sent to your email.' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message ?? 'Could not send a verification code.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!code) return;
    setLoading(true);
    setStatus({ type: null, text: '' });
    try {
      await confirmEnable2FA(code);
      await refreshUser();
      setStatus({ type: 'success', text: 'Two-factor authentication is now enabled.' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message ?? 'Could not verify that code.' });
    } finally {
      setLoading(false);
    }
  };

  if (step === 'idle') {
    return (
      <div className="settings-form">
        <p className="modal-text">Two-factor authentication is currently disabled.</p>
        {status.text && (
          <p className={`modal-text modal-text--${status.type}`}>{status.text}</p>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-button modal-button--primary" onClick={handleSendCode} disabled={loading}>
            {loading ? 'Sending…' : 'Enable 2FA'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="settings-form" onSubmit={handleVerify}>
      <div className="form-group">
        <label htmlFor="enable-2fa-code">Verification code</label>
        <input
          id="enable-2fa-code"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => { setCode(e.target.value); setStatus({ type: null, text: '' }); }}
          autoFocus
          disabled={loading}
        />
      </div>

      {status.text && (
        <p className={`modal-text modal-text--${status.type}`}>{status.text}</p>
      )}

      <div className="modal-actions">
        <button type="button" className="modal-button modal-button--ghost" onClick={handleSendCode} disabled={loading}>
          Resend code
        </button>
        <button type="submit" className="modal-button modal-button--primary" disabled={loading || !code}>
          {loading ? 'Verifying…' : 'Verify & enable'}
        </button>
      </div>
    </form>
  );
};

const DisableTwoFactor = () => {
  const { refreshUser } = useAuth();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ type: null, text: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setStatus({ type: null, text: '' });
    try {
      await disable2FA(password);
      await refreshUser();
      setPassword('');
      setStatus({ type: 'success', text: 'Two-factor authentication is now disabled.' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message ?? 'Could not disable 2FA.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      <p className="modal-text">Two-factor authentication is currently enabled.</p>
      <div className="form-group">
        <label htmlFor="disable-2fa-password">Current password</label>
        <input
          id="disable-2fa-password"
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setStatus({ type: null, text: '' }); }}
          autoComplete="current-password"
          disabled={loading}
        />
      </div>

      {status.text && (
        <p className={`modal-text modal-text--${status.type}`}>{status.text}</p>
      )}

      <div className="modal-actions">
        <button type="submit" className="modal-button modal-button--danger" disabled={loading || !password}>
          {loading ? 'Disabling…' : 'Disable 2FA'}
        </button>
      </div>
    </form>
  );
};

const TwoFactorSection = () => {
  const { user } = useAuth();
  return user?.twoFactorEnabled ? <DisableTwoFactor /> : <EnableTwoFactor />;
};

export default TwoFactorSection;
