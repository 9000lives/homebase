// ============================================================
//  src/components/FormStatus.jsx
//  The success/error line under a settings or admin form.
//
//  Exists mainly to carry role="status": without a live region, a
//  screen-reader user gets no confirmation that their password changed,
//  because nothing else on the page moves when it does.
// ============================================================

import React from 'react';

/**
 * @param {object} status - { type: 'success' | 'error' | null, text: string }
 */
const FormStatus = ({ status }) => {
  if (!status?.text) return null;
  return (
    <p className={`modal-text modal-text--${status.type}`} role="status">
      {status.text}
    </p>
  );
};

export default FormStatus;
