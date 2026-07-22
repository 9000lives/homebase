// ============================================================
//  src/pages/Settings.jsx
// ============================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ChangeUsernameModal from '../components/settings/ChangeUsernameModal';
import ChangePasswordModal from '../components/settings/ChangePasswordModal';
import TwoFactorSection from '../components/settings/TwoFactorSection';
import '../styles/dashboard.css';
import '../styles/settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button type="button" className="settings-back" onClick={() => navigate('/dashboard')}>
          &larr; Back to Dashboard
        </button>
        <h1 className="settings-header__title">Settings</h1>
      </header>

      <main className="settings-main">
        <div className="settings-layout">
          <nav className="settings-sidebar">
            <a href="#appearance" className="settings-sidebar__link">Appearance</a>
            <a href="#account" className="settings-sidebar__link">Account</a>
            <a href="#security" className="settings-sidebar__link">Security</a>
          </nav>

          <div className="settings-content">
            <section id="appearance" className="settings-section">
              <h2 className="settings-section__title">Appearance</h2>
              <div className="theme-toggle-row">
                <div>
                  <div className="theme-toggle-row__label">Dark mode</div>
                  <div className="theme-toggle-row__sub">Applies to this browser only.</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={theme === 'dark'}
                  aria-label="Toggle dark mode"
                  className={`theme-toggle${theme === 'dark' ? ' theme-toggle--on' : ''}`}
                  onClick={toggleTheme}
                >
                  <span className="theme-toggle__thumb" />
                </button>
              </div>
            </section>

            <section id="account" className="settings-section">
              <h2 className="settings-section__title">Account</h2>
              <div className="settings-readonly">
                <label className="settings-readonly__label">Username</label>
                <div className="settings-readonly__value">{user?.displayName}</div>
              </div>
              <div className="settings-field-action">
                <button
                  type="button"
                  className="modal-button modal-button--ghost"
                  onClick={() => setUsernameModalOpen(true)}
                >
                  Change Username
                </button>
              </div>
            </section>

            <section id="security" className="settings-section">
              <h2 className="settings-section__title">Security</h2>
              <div className="settings-readonly">
                <label className="settings-readonly__label">Password</label>
                <div className="settings-readonly__value">••••••••</div>
              </div>
              <div className="settings-field-action">
                <button
                  type="button"
                  className="modal-button modal-button--ghost"
                  onClick={() => setPasswordModalOpen(true)}
                >
                  Change Password
                </button>
              </div>

              <h3 className="settings-section__subtitle">Two-factor authentication</h3>
              <TwoFactorSection />
            </section>
          </div>
        </div>
      </main>

      {usernameModalOpen && <ChangeUsernameModal onClose={() => setUsernameModalOpen(false)} />}
      {passwordModalOpen && <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />}
    </div>
  );
};

export default Settings;
