// ============================================================
//  src/components/admin/UserTile.jsx
//  Account tile for the admin boxes.
//
//  Reuses the .share-user-tile* classes from dashboard.css (originally the
//  share modal's result rows) verbatim — they're already generic, and
//  renaming them would churn ShareModal for no functional gain. Those
//  classes are therefore SHARED: check ShareModal before editing them.
// ============================================================

import React from 'react';
import StatusBadge from './StatusBadge';

/**
 * @param {object}   user        - { id, displayName, email, status }
 * @param {string}   actionLabel - button text ("Activate", "View")
 * @param {string}   [variant]   - modal-button variant: 'primary' | 'ghost'
 * @param {node}     [icon]      - optional icon rendered before the label
 * @param {Function} onAction    - called with `user` when the button is clicked
 * @param {boolean}  [busy]      - disables just this row's button
 * @param {boolean}  [showStatus] - render a status badge under the email
 */
const UserTile = ({
  user,
  actionLabel,
  variant = 'primary',
  icon = null,
  onAction,
  busy = false,
  showStatus = false,
}) => (
  <div className="share-user-tile">
    <div className="share-user-tile__info">
      <span className="share-user-tile__name">{user.displayName}</span>
      <span className="share-user-tile__email">{user.email}</span>
      {showStatus && <StatusBadge status={user.status} />}
    </div>
    <button
      type="button"
      className={`modal-button modal-button--${variant} share-user-tile__button`}
      disabled={busy}
      onClick={() => onAction(user)}
    >
      {icon}
      {actionLabel}
    </button>
  </div>
);

export default UserTile;
