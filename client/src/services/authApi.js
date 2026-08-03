// ============================================================
//  src/services/authApi.js
// ============================================================

// Only the origin and the raw request are shared with apiClient.js. Everything
// below — the storage keys, absorbCredentials, and the session helpers — stays
// here deliberately: this module is the single place a credential is written to
// or read from localStorage, and spreading that across the service layer is how
// a rotated token quietly stops being absorbed.
//
// The import is from apiConfig, NOT apiClient: apiClient imports getStoredToken
// from this file, so importing it back here would be a cycle. This module also
// keeps its own header builder — it needs a no-auth variant that apiClient
// doesn't have.
import { USERS_API_URL as API_BASE_URL } from './apiConfig';

const TOKEN_KEY  = 'homebase_token';
const USER_KEY   = 'homebase_user';
// Proves to the server that THIS browser already passed a 2FA challenge, so it
// can skip the emailed code until the device's trust expires. It is a bearer
// credential for skipping the second factor, so it never leaves this origin and
// is cleared whenever the session ends.
const DEVICE_KEY = 'homebase_device';

// Mirrors the server's policy (server/config/env.js PASSWORD_MIN_LENGTH).
// Client-side checking is UX only — the server is authoritative and re-checks
// length, breach status, and similarity to the account's own identity.
export const PASSWORD_MIN_LENGTH = 12;

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const getStoredUser  = () => {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};
export const getStoredDeviceToken = () => localStorage.getItem(DEVICE_KEY);

const buildHeaders = (includeAuth = false) => {
  const headers = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    const token = getStoredToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const apiFetch = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw body;
  return body;
};

// Several endpoints now hand back a replacement credential:
//
//   token       — issued when the server invalidates the caller's existing
//                 sessions (password change, 2FA disable). Without absorbing it
//                 here, the browser that performed the change would be signed
//                 out by its own action.
//   deviceToken — issued when this browser passes a 2FA challenge or enrols in
//                 2FA, so it can skip the challenge next time.
//
// Handling both in one place keeps every caller unaware of it — no component
// needs to know that a password change rotates the session token.
const absorbCredentials = (body) => {
  if (body?.token) localStorage.setItem(TOKEN_KEY, body.token);
  if (body?.deviceToken) localStorage.setItem(DEVICE_KEY, body.deviceToken);
  return body;
};

// ── POST /api/users/login ─────────────────────────────────────
// Returns: { _id, name, email, role, token, twoFactorEnabled }
//      OR: { twoFactorRequired: true, loginToken }
//
// The device token is sent so a browser that already completed a challenge
// isn't asked again. Trust is bound to this device — it is NOT an account-wide
// "skip 2FA for a week" flag, which is what the server used to do.
export const loginUser = (email, password) =>
  apiFetch('/login', {
    method:  'POST',
    headers: buildHeaders(),
    body:    JSON.stringify({ email, password, deviceToken: getStoredDeviceToken() }),
  }).then(absorbCredentials);

// ── POST /api/users/ ─────────────────────────────────────────
// Sends:   { name, email, password }
// Returns: { _id, name, email, role, token }
export const signupUser = (name, email, password) =>
  apiFetch('/', {
    method:  'POST',
    headers: buildHeaders(),
    body:    JSON.stringify({ name, email, password }),
  });

// ── GET /api/users/me ─────────────────────────────────────────
// Sends:   Authorization: Bearer <token>
// Returns: { id, displayName, email, role, twoFactorEnabled }
export const verifyToken = () =>
  apiFetch('/me', {
    method:  'GET',
    headers: buildHeaders(true),
  });

// ── POST /api/users/login/2fa ─────────────────────────────────
// Sends:   { loginToken, code }
// Returns: { _id, name, email, role, token, deviceToken }
export const completeLoginWith2FA = (loginToken, code) =>
  apiFetch('/login/2fa', {
    method:  'POST',
    headers: buildHeaders(),
    body:    JSON.stringify({ loginToken, code }),
  }).then(absorbCredentials);

// ── POST /api/users/logout ────────────────────────────────────
// Server-side this now invalidates every session token for the account (not
// just this tab) and drops this device's 2FA trust, so the next sign-in from
// this browser is challenged again. Always clears the local session afterward,
// even if the call fails — a user should never be stuck unable to log out
// locally just because the network request failed.
export const logoutUser = async () => {
  try {
    await apiFetch('/logout', {
      method:  'POST',
      headers: buildHeaders(true),
      body:    JSON.stringify({ deviceToken: getStoredDeviceToken() }),
    });
  } catch {
    // ignore — we still want to clear the local session below
  } finally {
    clearSession();
    // The server revoked this device's 2FA trust, so drop our copy too.
    localStorage.removeItem(DEVICE_KEY);
  }
};

// ── POST /api/users/password/forgot ───────────────────────────
// Sends:   { email }
// Returns: { message } — ALWAYS the same, whether or not that address has an
//          account. Do not branch the UI on this response; there is nothing in
//          it to branch on, and that is the point.
//
// Deliberately not routed through absorbCredentials: the reset endpoints are
// public and return no credential of any kind.
export const requestPasswordReset = (email) =>
  apiFetch('/password/forgot', {
    method:  'POST',
    headers: buildHeaders(),
    body:    JSON.stringify({ email }),
  });

// ── POST /api/users/password/reset ────────────────────────────
// Sends:   { email, code, newPassword, confirmNewPassword }
// Returns: { message } — no token. The user signs in afterwards, so an account
//          with 2FA enabled still gets its second-factor challenge.
export const resetPassword = ({ email, code, newPassword, confirmNewPassword }) =>
  apiFetch('/password/reset', {
    method:  'POST',
    headers: buildHeaders(),
    body:    JSON.stringify({ email, code, newPassword, confirmNewPassword }),
  });

// NOTE: the admin status-change call lives in services/adminApi.js as
// setUserStatus() — it hits PATCH /api/admin/users/:id/status.

// ── PATCH /api/users/me/username ──────────────────────────────
// Sends:   { password, displayName }
// Returns: { id, displayName, email, role }
export const changeUsername = (password, displayName) =>
  apiFetch('/me/username', {
    method:  'PATCH',
    headers: buildHeaders(true),
    body:    JSON.stringify({ password, displayName }),
  });

// ── PATCH /api/users/me/password (2FA disabled) ───────────────
// Sends:   { currentPassword, newPassword, confirmNewPassword }
// Returns: { message, token } — the replacement token is absorbed automatically
export const changePassword = (currentPassword, newPassword, confirmNewPassword) =>
  apiFetch('/me/password', {
    method:  'PATCH',
    headers: buildHeaders(true),
    body:    JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
  }).then(absorbCredentials);

// ── POST /api/users/me/password/2fa-challenge (2FA enabled, step 1) ──
export const requestPasswordChangeCode = () =>
  apiFetch('/me/password/2fa-challenge', {
    method:  'POST',
    headers: buildHeaders(true),
  });

// ── PATCH /api/users/me/password/2fa-confirm (2FA enabled, step 2) ───
// Sends: { code, newPassword, confirmNewPassword }
export const confirmPasswordChangeWithCode = (code, newPassword, confirmNewPassword) =>
  apiFetch('/me/password/2fa-confirm', {
    method:  'PATCH',
    headers: buildHeaders(true),
    body:    JSON.stringify({ code, newPassword, confirmNewPassword }),
  }).then(absorbCredentials);

// ── POST /api/users/me/2fa/enable (step 1) ────────────────────
export const requestEnable2FA = () =>
  apiFetch('/me/2fa/enable', {
    method:  'POST',
    headers: buildHeaders(true),
  });

// ── POST /api/users/me/2fa/verify (step 2) ────────────────────
// Sends: { code } — Returns: { twoFactorEnabled: true, deviceToken }
export const confirmEnable2FA = (code) =>
  apiFetch('/me/2fa/verify', {
    method:  'POST',
    headers: buildHeaders(true),
    body:    JSON.stringify({ code }),
  }).then(absorbCredentials);

// ── POST /api/users/me/2fa/disable ────────────────────────────
// Sends: { password } — Returns: { twoFactorEnabled: false, token }
// Disabling 2FA invalidates existing sessions server-side, so the replacement
// token returned here keeps this browser signed in.
export const disable2FA = (password) =>
  apiFetch('/me/2fa/disable', {
    method:  'POST',
    headers: buildHeaders(true),
    body:    JSON.stringify({ password }),
  }).then((body) => {
    localStorage.removeItem(DEVICE_KEY);   // no 2FA, no device trust to keep
    return absorbCredentials(body);
  });

// ── Session helpers ───────────────────────────────────────────
export const persistSession = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

// Clears the SESSION only. The device token deliberately survives, so a
// session that simply expired doesn't also cost this browser its 2FA trust —
// otherwise the device window could never outlive the shorter token lifetime.
// Explicit sign-out (logoutUser) clears the device token as well.
export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};
