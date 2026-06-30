// ============================================================
//  src/pages/Login.jsx
// ============================================================

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser } from '../services/authApi';
import '../styles/auth.css';

const Login = () => {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const from = location.state?.from?.pathname ?? '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // POST /api/users/login → { _id, name, email, token }
      const data = await loginUser(email, password);
      login(data, data.token);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message ?? 'Incorrect email or password. Please try again.');
    } finally {
      setLoading(false);
    }
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

        <p className="auth-footer">
          Don't have an account?&nbsp;<Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
