// ============================================================
//  src/hooks/useDebouncedValue.js
//  Waits for `delay` ms of quiet before adopting a new value, so a
//  search box doesn't fire a request on every keystroke.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @param   {*}      value   - the value to debounce
 * @param   {number} [delay] - quiet period in ms
 * @returns {[*, Function]} the debounced value, and `flush(next)` which adopts
 *          `next` immediately and cancels the pending wait — for "search now"
 *          on Enter and for clearing, neither of which should sit behind the
 *          delay. Without cancelling, an in-flight timer would land afterwards
 *          and overwrite what was just flushed.
 */
export const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timerRef.current);
  }, [value, delay]);

  const flush = useCallback((next) => {
    clearTimeout(timerRef.current);
    setDebounced(next);
  }, []);

  return [debounced, flush];
};
