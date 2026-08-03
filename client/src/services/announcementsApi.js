// ============================================================
//  src/services/announcementsApi.js
//  The member-facing side of announcements. Creating and retracting
//  them is an admin action and lives in services/adminApi.js.
// ============================================================

import { ANNOUNCEMENTS_API_URL, apiFetch, authHeaders } from './apiClient';

// ── GET /api/announcements ──
/**
 * Announcements this user hasn't seen that haven't expired, newest first.
 * Returns: [{ id, title, body, createdAt, expiresAt }] — often empty.
 */
export const fetchActiveAnnouncements = () =>
  apiFetch(ANNOUNCEMENTS_API_URL, {
    method:  'GET',
    headers: authHeaders({ json: false }),
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
    headers: authHeaders({ json: false }),
  });
