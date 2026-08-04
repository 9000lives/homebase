// ============================================================
//  src/services/feedbackApi.js
//  The member-facing side of feedback. Reading and triaging it is an
//  admin action and lives in services/adminApi.js.
//
//  There is exactly one function here, and no fetch counterpart, because
//  the API has no member read endpoint — see server/routes/feedbackRoutes.js
//  for why that absence is deliberate.
// ============================================================

import { FEEDBACK_API_URL, apiFetch, authHeaders } from './apiClient';

// ── POST /api/feedback ──
/**
 * Sends one message to the admin. `type` must be one of the values in
 * utils/feedbackTypes.js; `message` is trimmed and capped at 1000 characters
 * server-side. Rate limited to 10 per hour per account.
 *
 * Returns: { id, type, createdAt } — the caller ignores it. The response
 * deliberately doesn't echo the message or expose the triage state, and there
 * is no member-facing history to add it to.
 */
export const submitFeedback = ({ type, message }) =>
  apiFetch(FEEDBACK_API_URL, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify({ type, message }),
  });
