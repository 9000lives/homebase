// ============================================================
//  src/hooks/useDebouncedValue.js
//  Waits for `delay` ms of quiet before adopting a new value, so a
//  search box doesn't fire a request on every keystroke.
// ============================================================

import { useEffect, useState } from 'react';

export const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};
