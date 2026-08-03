// ============================================================
//  src/components/AuthCard.jsx
//  The shell shared by Login, Signup and ForgotPassword: the centred
//  card, the wordmark, and the error banner.
//
//  ErrorBanner is always rendered, never conditionally — the banner
//  animates open from max-height:0, so it has to be in the DOM before
//  there is an error for the transition to have anything to run from.
//  That also keeps role="alert" mounted, which is what makes the message
//  announced when it appears rather than merely present.
// ============================================================

import React from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * @param {string} error - current error text; '' renders the banner collapsed
 */
export const ErrorBanner = ({ error }) => (
  // role="alert" alone. It already implies aria-live="assertive"; adding
  // aria-live="polite" alongside it (as all four call sites used to) asks for
  // two different urgencies at once.
  <div
    className={`error-banner${error ? ' error-banner--visible' : ''}`}
    role="alert"
  >
    <span className="error-banner__icon" aria-hidden="true">⚠</span>
    <span>{error}</span>
  </div>
);

/**
 * @param {string} title    - the page's heading. Visually hidden: the design
 *                            names the page through the form itself, but the
 *                            document still needs an h1, and the wordmark names
 *                            the product rather than the page.
 * @param {string} [error]  - passed straight to ErrorBanner
 */
const AuthCard = ({ title, error = '', children }) => {
  // The heading and the tab title are the same string on these pages, so all
  // three auth routes get their document title from here rather than each
  // calling the hook themselves.
  useDocumentTitle(title);

  return (
  <div className="auth-background">
    <div className="auth-card">
      <div className="auth-header">
        <div className="auth-logo">
          <span className="logo-home">Home</span><span className="logo-base">base</span>
        </div>
        <div className="logo-divider" />
      </div>

      <h1 className="sr-only">{title}</h1>

      <ErrorBanner error={error} />

      {children}
    </div>
  </div>
  );
};

export default AuthCard;
