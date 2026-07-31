// ============================================================
//  src/services/announcementsApi.js
//  The member-facing side of announcements. Creating and retracting
//  them is an admin action and lives in services/adminApi.js.
// ============================================================

import { getStoredToken } from './authApi';

// ✏️  Change the port to match your backend
const ANNOUNCEMENTS_API_URL = 'http://localhost:3000/api/announcements';

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

// ── GET /api/announcements ──
/**
 * Announcements this user hasn't seen that haven't expired, newest first.
 * Returns: [{ id, title, body, createdAt, expiresAt }] — often empty.
 */
export const fetchActiveAnnouncements = () =>
  apiFetch(ANNOUNCEMENTS_API_URL, {
    method:  'GET',
    headers: buildJsonHeaders(),
  });

// ── PATCH /api/announcements/seen ──
/**
 * Advances this user's "seen" watermark to now, so nothing currently live is
 * shown again. Idempotent — safe to call more than once.
 * Returns: { lastSeenAnnouncementAt }
 */
export const markAnnouncementsSeen = () =>
  apiFetch(`${ANNOUNCEMENTS_API_URL}/seen`, {
    method:  'PATCH',
    headers: buildJsonHeaders(),
  });
