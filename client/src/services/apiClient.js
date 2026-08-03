// ============================================================
//  src/services/apiClient.js
//  The one place the API origin is configured and the one place a
//  request is actually issued.
//
//  Before this existed, apiFetch and buildJsonHeaders were copy-pasted
//  verbatim into four service modules and the origin was written out in
//  six constants, so pointing the app at a real deployment meant editing
//  five files and hoping none were missed.
// ============================================================

import { getStoredToken } from './authApi';

// Re-exported so a service module needs one import, not two. The values are
// defined in apiConfig.js, which imports nothing — see the note there for why
// they can't live in this file.
export {
  API_ORIGIN,
  FILES_API_URL,
  FOLDERS_API_URL,
  USERS_API_URL,
  ADMIN_API_URL,
  ANNOUNCEMENTS_API_URL,
} from './apiConfig';

/**
 * Authorization header, plus Content-Type only when there is a body to type.
 *
 * `json: false` on bodyless GETs is not cosmetic: Content-Type on a GET makes
 * it a non-simple request, so the browser fires a preflight OPTIONS before
 * every list, preview and download.
 *
 * @param {boolean} [json] - include Content-Type: application/json
 */
export const authHeaders = ({ json = true } = {}) => {
  const headers = json ? { 'Content-Type': 'application/json' } : {};
  const token = getStoredToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Headers for multipart uploads. Content-Type is omitted DELIBERATELY — the
// browser sets it, including the multipart boundary, when the body is FormData.
// Setting it by hand produces a boundary-less header and the upload fails.
export const uploadHeaders = () => authHeaders({ json: false });

/**
 * Throws the parsed error body (a plain object, not an Error), so callers read
 * `err.message` off it. Error bodies also carry `requestId`, which is the
 * handle an operator needs to find the real stack server-side.
 */
export const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw body;
  return body;
};

/**
 * Same as apiFetch, but also reports the collection's true size.
 *
 * List endpoints are server-bounded (200 by default, 500 max), so a long array
 * comes back silently truncated — the real total is only in X-Total-Count.
 * The server already lists that header in its CORS `exposedHeaders`, so it is
 * readable cross-origin without a server change.
 *
 * @returns {Promise<{ items: Array, total: number }>} total falls back to the
 *          returned length when the header is absent, so callers never have to
 *          special-case a missing header.
 */
export const apiFetchList = async (url, options = {}) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw body;
  const header = response.headers.get('X-Total-Count');
  const items = Array.isArray(body) ? body : [];
  return { items, total: header === null ? items.length : Number(header) };
};

/**
 * Same, but returns the raw bytes.
 *
 * Auth here is header-based on purpose. A plain <img>/<iframe>/<a href> can't
 * carry a header, so the obvious shortcut is to put the token in the URL —
 * which would leak it into browser history, Referer headers and every proxy
 * and server log in between. Fetching as a Blob and handing back an object URL
 * is what avoids that. Never add a token query parameter here.
 */
export const fetchBlob = async (url) => {
  const response = await fetch(url, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw body;
  }
  return response.blob();
};
