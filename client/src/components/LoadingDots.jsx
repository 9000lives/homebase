// ============================================================
//  src/components/LoadingDots.jsx
//  The three bouncing dots used while something is in flight.
// ============================================================

import React from 'react';

/**
 * @param {boolean} [fullScreen] - centre in the viewport (session verification)
 *                                 rather than inline in a panel.
 */
const LoadingDots = ({ fullScreen = false }) => (
  <div className={fullScreen ? 'auth-loading' : 'dashboard-loading'}>
    <span className="auth-loading__dot" />
    <span className="auth-loading__dot" />
    <span className="auth-loading__dot" />
  </div>
);

export default LoadingDots;
