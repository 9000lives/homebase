// ============================================================
//  src/components/admin/StatusBadge.jsx
//  Account status pill. Always carries the status WORD — the colour
//  is a supporting cue, never the only encoding.
// ============================================================

import React from 'react';

const StatusBadge = ({ status }) => {
  if (!status) return null;
  return <span className={`status-badge status-badge--${status}`}>{status}</span>;
};

export default StatusBadge;
