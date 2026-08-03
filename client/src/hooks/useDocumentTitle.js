// ============================================================
//  src/hooks/useDocumentTitle.js
//  Sets the browser tab title for the current page.
// ============================================================

import { useEffect } from 'react';

const SUFFIX = 'Homebase';

/**
 * @param {string} title - page name; '' or undefined leaves just the suffix.
 */
export const useDocumentTitle = (title) => {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
  }, [title]);
};
