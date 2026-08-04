// ============================================================
//  src/pages/Login.jsx
// ============================================================

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, completeLoginWith2FA } from '../services/authApi';
import AuthLayout from '../components/AuthLayout';
import '../styles/auth.css';

const Login = () => {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Set once a login response comes back with twoFactorRequired: true.
  // While this is non-null, the form below renders the OTP step instead.
  const [pendingLoginToken, setPendingLoginToken] = useState(null);
  const [code, setCode] = useState('');

  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const from = location.state?.from?.pathname ?? '/dashboard';

  // Set by ForgotPassword after a successful reset, so the confirmation lands
  // on the page they were sent to rather than on the one they left.
  const notice = location.state?.notice ?? '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // POST /api/users/login → { _id, name, email, token } OR { twoFactorRequired, loginToken }
      const data = await loginUser(email, password);
      if (data.twoFactorRequired) {
        setPendingLoginToken(data.loginToken);
        return;
      }
      login(data, data.token);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message ?? 'Incorrect email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await completeLoginWith2FA(pendingLoginToken, code);
      login(data, data.token);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message ?? 'Could not verify that code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await loginUser(email, password);
      if (data.twoFactorRequired) {
        setPendingLoginToken(data.loginToken);
      }
    } catch (err) {
      setError(err.message ?? 'Could not resend the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Sign in" error={error}>
        {notice && !error && (
          <p className="auth-notice" role="status">{notice}</p>
        )}

        {!pendingLoginToken ? (
          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            <button type="submit" className="auth-button" disabled={loading}>
              {loading && <span className="btn-spinner" aria-hidden="true" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="auth-form" noValidate>
            <div className="form-group">
              <label htmlFor="otp-code">Verification code</label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                autoFocus
                required
                disabled={loading}
              />
            </div>

            <button type="submit" className="auth-button" disabled={loading || !code}>
              {loading && <span className="btn-spinner" aria-hidden="true" />}
              {loading ? 'Verifying…' : 'Verify & sign in'}
            </button>

            <button
              type="button"
              className="auth-button auth-button--quiet"
              onClick={handleResend}
              disabled={loading}
            >
              Resend code
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="auth-footer auth-footer--tight">
          Don't have an account?&nbsp;<Link to="/signup">Create one</Link>
        </p>
    </AuthLayout>
  );
};

export default Login;
