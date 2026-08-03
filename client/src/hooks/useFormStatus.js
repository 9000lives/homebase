// ============================================================
//  src/hooks/useFormStatus.js
//  The success/error line every settings and admin form carries.
//
//  Pairs with <FormStatus>, which renders it inside a live region.
//  The state shape and the clear-on-edit idiom were written out at seven
//  call sites before this existed.
// ============================================================

import { useCallback, useState } from 'react';

const EMPTY = { type: null, text: '' };

/**
 * @returns {{ status: object, setSuccess: Function, setError: Function, clear: Function }}
 */
export const useFormStatus = () => {
  const [status, setStatus] = useState(EMPTY);

  const setSuccess = useCallback((text) => setStatus({ type: 'success', text }), []);
  const setError   = useCallback((text) => setStatus({ type: 'error', text }), []);
  const clear      = useCallback(() => setStatus(EMPTY), []);

  return { status, setSuccess, setError, clear };
};
