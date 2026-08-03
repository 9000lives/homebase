// ============================================================
//  src/services/adminApi.js
//  Admin dashboard endpoints. Every route here is behind
//  protect + requireAdmin server-side — a non-admin token gets a 403.
// ============================================================

import { ADMIN_API_URL, apiFetch, authHeaders } from './apiClient';

// ── GET /api/admin/stats/storage ──
/**
 * Platform-wide storage totals, grouped into friendly file-type categories.
 * Returns: { totalBytes, fileCount, categories: [{ key, label, bytes, fileCount }] }
 * `categories` always has all six entries, in a fixed order, zero-filled.
 */
export const fetchStorageStats = () =>
  apiFetch(`${ADMIN_API_URL}/stats/storage`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
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
    headers: authHeaders({ json: false }),
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
    headers: authHeaders({ json: false }),
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
    headers: authHeaders(),
    body:    JSON.stringify({ status }),
  });

// ── POST /api/admin/announcements ──
/**
 * Broadcasts an announcement to every active user. `expiresAt` must be an ISO
 * string in the future — the server rejects a past date rather than silently
 * creating something nobody will ever see.
 * Returns: { id, title, body, createdAt, expiresAt, createdBy }
 */
export const createAnnouncement = ({ title, body, expiresAt }) =>
  apiFetch(`${ADMIN_API_URL}/announcements`, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ title, body, expiresAt }),
  });

// ── GET /api/admin/announcements ──
/**
 * Every announcement, newest first, including expired ones — the admin list is
 * also the history. Expiry is NOT precomputed: derive it from `expiresAt` so a
 * list left open past an expiry corrects itself.
 * Returns: [{ id, title, body, createdAt, expiresAt, createdBy }]
 */
export const fetchAnnouncements = () =>
  apiFetch(`${ADMIN_API_URL}/announcements`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });

// ── DELETE /api/admin/announcements/:id ──
/**
 * Retracts an announcement. Users who already saw it are unaffected — this only
 * stops it reaching anyone who hasn't.
 * Returns: { id }
 */
export const deleteAnnouncement = (announcementId) =>
  apiFetch(`${ADMIN_API_URL}/announcements/${announcementId}`, {
    method:  'DELETE',
    headers: authHeaders({ json: false }),
  });

// ── POST /api/admin/users/:id/revoke-sessions ──
/**
 * Signs an account out of every device and drops its 2FA device trust, without
 * suspending it — the answer to "I think someone got into my account".
 * The server rejects your own account and any admin account (400).
 * Returns: { id, displayName, email, tokenVersion }
 */
export const revokeUserSessions = (userId) =>
  apiFetch(`${ADMIN_API_URL}/users/${userId}/revoke-sessions`, {
    method:  'POST',
    headers: authHeaders({ json: false }),
  });

// ── POST /api/admin/users/:id/reset-2fa ──
/**
 * Turns off an account's two-factor authentication and signs it out everywhere.
 * There is no password-reset flow, so this is the only recovery route for
 * someone locked out of the inbox their codes go to. The user is emailed.
 * Returns: { id, displayName, email, twoFactorEnabled }
 */
export const resetUserTwoFactor = (userId) =>
  apiFetch(`${ADMIN_API_URL}/users/${userId}/reset-2fa`, {
    method:  'POST',
    headers: authHeaders({ json: false }),
  });

// ── DELETE /api/admin/users/:id ──
/**
 * Permanently deletes an account, every file and folder it owns, and its bytes
 * on disk. `confirmEmail` must match the account's email exactly or the server
 * rejects it (400) — the typed address IS the confirmation.
 * Returns: { id, fileCount }
 */
export const deleteUser = (userId, confirmEmail) =>
  apiFetch(`${ADMIN_API_URL}/users/${userId}`, {
    method:  'DELETE',
    headers: authHeaders(),
    body:    JSON.stringify({ confirmEmail }),
  });

// ── GET /api/admin/audit?event=&actorId=&since=&limit=&skip= ──
/**
 * The audit trail, newest first. `event` is an anchored prefix match, so "auth"
 * selects every auth.* event and "auth.login_failed" selects just that one.
 *
 * Unlike the other list endpoints this returns an ENVELOPE, not a bare array —
 * the paging UI needs the unbounded total and apiFetch discards the Response,
 * so a header alone would be unreadable.
 * Returns: { total, limit, skip, rows: [{ id, event, actor, target, ip,
 *            userAgent, requestId, meta, createdAt }] }
 * `actor`/`target` are null when the event had none, and carry
 * `{ id, displayName: null, deleted: true }` when the account has since gone.
 */
export const fetchAuditLog = ({ event = null, actorId = null, since = null, limit = null, skip = null } = {}) => {
  const params = new URLSearchParams();
  if (event)   params.append('event', event);
  if (actorId) params.append('actorId', actorId);
  if (since)   params.append('since', since);
  if (limit)   params.append('limit', String(limit));
  if (skip)    params.append('skip', String(skip));
  return apiFetch(`${ADMIN_API_URL}/audit?${params.toString()}`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });
};

// ── GET /api/admin/audit/events ──
/**
 * Event names actually present in the trail, read from the data rather than a
 * hardcoded list — a new audit() call appears here without registration.
 * Returns: { events: [string], categories: [string] }
 */
export const fetchAuditEvents = () =>
  apiFetch(`${ADMIN_API_URL}/audit/events`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });

// ── GET /api/admin/system/health ──
/**
 * Runtime state of the instance.
 * Returns: { database: { state, connected },
 *            mail: { configured, host, from },
 *            storage: { usedBytes, fileCount, diskFreeBytes, diskTotalBytes },
 *            process: { uptimeSeconds, nodeVersion, environment } }
 * The disk figures are null where the platform can't report them.
 * `mail.configured` means credentials are present, NOT that they work —
 * only sendTestEmail answers that.
 */
export const fetchSystemHealth = () =>
  apiFetch(`${ADMIN_API_URL}/system/health`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });

// ── GET /api/admin/system/config ──
/**
 * The non-secret half of the running configuration — an explicit server-side
 * allow-list, never a dump of the environment.
 * Returns: { maxUploadBytes, userStorageQuotaBytes, sessionTokenTtl,
 *            preAuthTokenTtl, deviceTrustDays, passwordMinLength,
 *            passwordBreachCheck, corsOrigins, trustProxy,
 *            auditRetentionDays, auditPersist, smtpConfigured }
 */
export const fetchSystemConfig = () =>
  apiFetch(`${ADMIN_API_URL}/system/config`, {
    method:  'GET',
    headers: authHeaders({ json: false }),
  });

// ── POST /api/admin/system/test-email ──
/**
 * Sends a test message to the requesting admin's own address. The recipient is
 * never a parameter. Rate limited to 5 per 15 minutes.
 * Returns: { sent: true, to }
 */
export const sendTestEmail = () =>
  apiFetch(`${ADMIN_API_URL}/system/test-email`, {
    method:  'POST',
    headers: authHeaders({ json: false }),
  });
