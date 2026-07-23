// ============================================================
//  src/services/usersApi.js
//  User lookup for file sharing (search by email/displayName).
// ============================================================

import { getStoredToken } from './authApi';

// ✏️  Change the port to match your backend
const USERS_API_URL = 'http://localhost:3000/api/users';

const buildJsonHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  const token = getStoredToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw body;
  return body;
};

// ── GET /api/users/search?q=<term>&fileId=<optional>&folderId=<optional> ──
/**
 * Searches active users by email or displayName. When `fileId` or `folderId`
 * is passed, each result is annotated with `isShared` — whether that
 * file/folder is already shared with that user.
 * Returns: [{ id, displayName, email, isShared }]
 */
export const searchUsers = (query, { fileId = null, folderId = null } = {}) => {
  const params = new URLSearchParams({ q: query });
  if (fileId) params.append('fileId', fileId);
  if (folderId) params.append('folderId', folderId);
  return apiFetch(`${USERS_API_URL}/search?${params.toString()}`, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });
};
