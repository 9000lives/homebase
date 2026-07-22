// ============================================================
//  src/pages/Settings.jsx
// ============================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import ChangeUsernameForm from '../components/settings/ChangeUsernameForm';
import ChangePasswordForm from '../components/settings/ChangePasswordForm';
import TwoFactorSection from '../components/settings/TwoFactorSection';
import '../styles/dashboard.css';
import '../styles/settings.css';

const Settings = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState('appearance'); // 'appearance' | 'account' | 'security'

  return (
    <div className="settings-page">
      <header className="settings-header">
        <button type="button" className="settings-back" onClick={() => navigate('/dashboard')}>
          &larr; Back to Dashboard
        </button>
        <h1 className="settings-header__title">Settings</h1>
      </header>

      <main className="settings-main">
        <div className="modal-type-toggle settings-tabs">
          <button
            type="button"
            className={`modal-type-toggle__btn${tab === 'appearance' ? ' modal-type-toggle__btn--active' : ''}`}
            onClick={() => setTab('appearance')}
          >
            Appearance
          </button>
          <button
            type="button"
            className={`modal-type-toggle__btn${tab === 'account' ? ' modal-type-toggle__btn--active' : ''}`}
            onClick={() => setTab('account')}
          >
            Account
          </button>
          <button
            type="button"
            className={`modal-type-toggle__btn${tab === 'security' ? ' modal-type-toggle__btn--active' : ''}`}
            onClick={() => setTab('security')}
          >
            Security
          </button>
        </div>

        {tab === 'appearance' && (
          <section className="settings-section">
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
        )}
        {tab === 'account' && (
          <section className="settings-section">
            <h2 className="settings-section__title">Username</h2>
            <ChangeUsernameForm />
          </section>
        )}
        {tab === 'security' && (
          <>
            <section className="settings-section">
              <h2 className="settings-section__title">Password</h2>
              <ChangePasswordForm />
            </section>
            <section className="settings-section">
              <h2 className="settings-section__title">Two-factor authentication</h2>
              <TwoFactorSection />
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default Settings;
