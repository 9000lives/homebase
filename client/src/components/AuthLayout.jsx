// ============================================================
//  src/components/AuthLayout.jsx
//  The shell shared by Login, Signup and ForgotPassword: the two-half
//  split, the brand in the top-left corner, and the error banner.
//
//  Left half is the form, right half is decoration (see AuthArt).
//  Below 900px the right half is dropped from the grid entirely and
//  the form goes full width.
//
//  ErrorBanner is always rendered, never conditionally — the banner
//  animates open from max-height:0, so it has to be in the DOM before
//  there is an error for the transition to have anything to run from.
//  That also keeps role="alert" mounted, which is what makes the message
//  announced when it appears rather than merely present.
// ============================================================

import React from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import AuthArt from './AuthArt';
import Logo from './Logo';

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
 *                            document still needs an h1, and the brand names
 *                            the product rather than the page.
 * @param {string} [error]  - passed straight to ErrorBanner
 */
const AuthLayout = ({ title, error = '', children }) => {
  // The heading and the tab title are the same string on these pages, so all
  // three auth routes get their document title from here rather than each
  // calling the hook themselves.
  useDocumentTitle(title);

  return (
    <div className="auth-layout">
      <div className="auth-panel">
        <div className="auth-panel__brand">
          <Logo variant="full" />
        </div>

        <div className="auth-panel__body">
          <h1 className="sr-only">{title}</h1>

          <ErrorBanner error={error} />

          {children}
        </div>
      </div>

      <AuthArt />
    </div>
  );
};

export default AuthLayout;
