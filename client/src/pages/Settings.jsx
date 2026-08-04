// ============================================================
//  src/pages/Settings.jsx
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SettingsModal from '../components/settings/SettingsModal';
import ChangeUsernameForm from '../components/settings/ChangeUsernameForm';
import ChangePasswordForm from '../components/settings/ChangePasswordForm';
import TwoFactorSection from '../components/settings/TwoFactorSection';
import FeedbackForm from '../components/settings/FeedbackForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import '../styles/dashboard.css';
import '../styles/settings.css';

const CONFIRMATION_DWELL_MS = 900;

const Settings = () => {
  useDocumentTitle('Settings');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const dismissTimer = useRef(null);
  useEffect(() => () => clearTimeout(dismissTimer.current), []);

  const closeAfterConfirmation = (setOpen) => () => {
    clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setOpen(false), CONFIRMATION_DWELL_MS);
  };

  // Gates both the sidebar link and the section below. The /admin route and
  // every admin endpoint enforce this independently — this only hides the door.
  const isAdmin = user?.role === 'admin';

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
            {/* This link and the section's id must move together — an anchor
                pointing at a missing id is a dead scroll with no error. */}
            <a href="#feedback" className="settings-sidebar__link">Feedback</a>
            {isAdmin && <a href="#admin" className="settings-sidebar__link">Admin</a>}
          </nav>

          <div className="settings-content">
            <section id="appearance" className="settings-section">
              <h2 className="settings-section__title">Appearance</h2>
              <div className="theme-toggle-row">
                <div>
                  <div className="theme-toggle-row__label">Dark mode</div>
                  <div className="theme-toggle-row__sub">
                    Follows your system setting until you change it here. Applies
                    to this browser only.
                  </div>
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
              {/* <span>, not <label> — there's no form control here to label,
                  and a label pointing at nothing is announced as a broken one. */}
              <div className="settings-readonly">
                <span className="settings-readonly__label">Username</span>
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
                <span className="settings-readonly__label">Password</span>
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

            {/* Rendered inline, like TwoFactorSection above — SettingsModal
                exists for forms reached by a "Change …" button, and a feedback
                box people are meant to notice belongs on the page itself. */}
            <section id="feedback" className="settings-section">
              <h2 className="settings-section__title">Feedback</h2>
              <p className="modal-text">
                Report a problem, ask for help, or suggest something. This goes
                straight to the admin — there&apos;s no reply here, so they&apos;ll
                get back to you by email.
              </p>
              <FeedbackForm />
            </section>

            {isAdmin && (
              <section id="admin" className="settings-section">
                <h2 className="settings-section__title">Admin</h2>
                <p className="modal-text">
                  Review pending accounts, manage users, and see storage usage across
                  all accounts.
                </p>
                <div className="settings-field-action">
                  <button
                    type="button"
                    className="modal-button modal-button--primary"
                    onClick={() => navigate('/admin')}
                  >
                    Open Admin Dashboard
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* closeAfterConfirmation, not a bare setTimeout: the delay lets the
          form's "…updated." line be read before the dialog closes over it, and
          the timer is cancelled on unmount so closing by hand first doesn't
          leave one pending. */}
      {usernameModalOpen && (
        <SettingsModal title="Change username" onClose={() => setUsernameModalOpen(false)}>
          <ChangeUsernameForm onSuccess={closeAfterConfirmation(setUsernameModalOpen)} />
        </SettingsModal>
      )}
      {passwordModalOpen && (
        <SettingsModal title="Change password" onClose={() => setPasswordModalOpen(false)}>
          <ChangePasswordForm onSuccess={closeAfterConfirmation(setPasswordModalOpen)} />
        </SettingsModal>
      )}
    </div>
  );
};

export default Settings;
