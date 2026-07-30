// ============================================================
//  src/services/adminApi.js
//  Admin dashboard endpoints. Every route here is behind
//  protect + requireAdmin server-side — a non-admin token gets a 403.
// ============================================================

import { getStoredToken } from './authApi';

// ✏️  Change the port to match your backend
const ADMIN_API_URL = 'http://localhost:3000/api/admin';

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

// ── GET /api/admin/stats/storage ──
/**
 * Platform-wide storage totals, grouped into friendly file-type categories.
 * Returns: { totalBytes, fileCount, categories: [{ key, label, bytes, fileCount }] }
 * `categories` always has all six entries, in a fixed order, zero-filled.
 */
export const fetchStorageStats = () =>
  apiFetch(`${ADMIN_API_URL}/stats/storage`, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });

// ── GET /api/admin/users?status=<status>&q=<term>&limit=<n> ──
/**
 * Lists accounts by status (the approval queue) and/or a name/email search term.
 * Unlike usersApi.searchUsers this returns accounts of ANY status, including the
 * requesting admin's own row. Returns [] if neither `status` nor `q` is given.
 * Returns: [{ id, displayName, email, role, status, createdAt }]
 */
export const fetchAdminUsers = ({ status = null, q = null, limit = null } = {}) => {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (q)      params.append('q', q);
  if (limit)  params.append('limit', String(limit));
  return apiFetch(`${ADMIN_API_URL}/users?${params.toString()}`, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });
};

// ── GET /api/admin/users/:id ──
/**
 * One account plus the storage consumed by the files it OWNS — files merely
 * shared with this user are not counted.
 * Returns: { id, displayName, email, role, status, twoFactorEnabled,
 *            createdAt, storage: { bytes, fileCount } }
 */
export const fetchAdminUser = (userId) =>
  apiFetch(`${ADMIN_API_URL}/users/${userId}`, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });

// ── PATCH /api/admin/users/:id/status ──
/**
 * Sets an account's status. `status` must be 'pending' | 'active' | 'suspended'.
 * The server rejects changing your own status or any admin account (400), and
 * emails the user when they go pending → active.
 * Returns: { id, displayName, email, role, status }
 */
export const setUserStatus = (userId, status) =>
  apiFetch(`${ADMIN_API_URL}/users/${userId}/status`, {
    method:  'PATCH',
    headers: buildJsonHeaders(),
    body:    JSON.stringify({ status }),
  });
