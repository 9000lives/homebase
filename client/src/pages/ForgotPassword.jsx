// ============================================================
//  src/pages/ForgotPassword.jsx
//  Self-service password reset: prove control of the registered
//  inbox with a 6-digit code, then set a new password.
//
//  Two steps swapped by state, the same way Login swaps to its 2FA
//  code form.
//
//  The step-1 response is IDENTICAL whether or not the address has an
//  account, so this page always advances to step 2. Never branch the UI
//  on that response — there is nothing in it to branch on, and putting
//  one back would hand out the membership list of a private platform.
// ============================================================

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordReset, resetPassword, PASSWORD_MIN_LENGTH } from '../services/authApi';
import '../styles/auth.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [sent, setSent] = useState(false);   // false = step 1, true = step 2
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const sendCode = async () => {
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
      setNotice(
        `If an account exists for ${email}, we've sent it a 6-digit code. It expires in 10 minutes.`
      );
    } catch (err) {
      // Only a malformed address or a rate limit can land here — the endpoint
      // does not report whether the account exists.
      setError(err.message ?? 'Could not send a reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = (e) => {
    e.preventDefault();
    sendCode();
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');

    // UX only — saves a round trip on the two most common rejections. The
    // server enforces both, plus the breach check and the similarity check,
    // and remains the authority.
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    setLoading(true);
    try {
      await resetPassword({
        email,
        code,
        newPassword: password,
        confirmNewPassword: confirm,
      });
      // No token comes back, by design — they sign in normally, so an account
      // with 2FA still gets challenged.
      navigate('/login', {
        replace: true,
        state: { notice: 'Password updated. Sign in with your new password.' },
      });
    } catch (err) {
      setError(err.message ?? 'Could not reset your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setSent(false);
    setCode('');
    setPassword('');
    setConfirm('');
    setError('');
    setNotice('');
  };

  return (
    <div className="auth-background">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <span className="logo-home">Home</span><span className="logo-base">base</span>
          </div>
          <div className="logo-divider" />
        </div>

        <div
          className={`error-banner${error ? ' error-banner--visible' : ''}`}
          role="alert"
          aria-live="polite"
        >
          <span className="error-banner__icon" aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>

        {!sent ? (
          <form onSubmit={handleRequest} className="auth-form" noValidate>
            <p className="auth-lede">
              Enter the email address on your account and we&apos;ll send you a code to
              set a new password.
            </p>

            <div className="form-group">
              <label htmlFor="reset-email">Email address</label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                required
                disabled={loading}
              />
            </div>

            <button type="submit" className="auth-button" disabled={loading || !email}>
              {loading && <span className="btn-spinner" aria-hidden="true" />}
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="auth-form" noValidate>
            {notice && <p className="auth-lede">{notice}</p>}

            <div className="form-group">
              <label htmlFor="reset-code">Reset code</label>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                autoComplete="one-time-code"
                autoFocus
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                required
                disabled={loading}
              />
              <p className="form-hint">
                At least {PASSWORD_MIN_LENGTH} characters. A memorable phrase beats a short complex password.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="reset-confirm">Confirm new password</label>
              <input
                id="reset-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="auth-button"
              disabled={loading || !code || !password || !confirm}
            >
              {loading && <span className="btn-spinner" aria-hidden="true" />}
              {loading ? 'Updating…' : 'Set new password'}
            </button>

            <button
              type="button"
              className="auth-button auth-button--quiet"
              onClick={sendCode}
              disabled={loading}
            >
              Resend code
            </button>

            <button
              type="button"
              className="auth-button auth-button--quiet"
              onClick={handleStartOver}
              disabled={loading}
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="auth-footer">
          Remembered it?&nbsp;<Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
