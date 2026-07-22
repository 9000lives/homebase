// ============================================================
//  src/components/Header.jsx
// ============================================================

import React from 'react';

/**
 * @param {Function} onNewItem  - called when "+ New" is clicked
 * @param {Function} onSettings - called when the settings icon is clicked
 * @param {Function} onLogout   - called when the logout icon is clicked
 */
const Header = ({ onNewItem, onSettings, onLogout }) => {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header__logo">
        <span className="logo-home">Home</span><span className="logo-base">base</span>
      </div>

      <div className="dashboard-header__center">
        <button type="button" className="new-item-button" onClick={onNewItem}>
          <span className="new-item-button__plus">+</span> New
        </button>
      </div>

      <div className="dashboard-header__actions">
        <button
          type="button"
          className="icon-button"
          onClick={onSettings}
          aria-label="Settings"
          title="Settings"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M12 15a3 3 0 100-6 3 3 0 000 6z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
            <path
              d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M16 17l5-5-5-5M21 12H9"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Header;
