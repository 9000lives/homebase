// ============================================================
//  src/services/authApi.js
// ============================================================

// ✏️  Change the port to match your backend
const API_BASE_URL = 'http://localhost:3000/api/users';

const TOKEN_KEY = 'homebase_token';
const USER_KEY  = 'homebase_user';

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const getStoredUser  = () => {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};

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

// ── POST /api/users/login ─────────────────────────────────────
// Returns: { _id, name, email, token }
export const loginUser = (email, password) =>
  apiFetch('/login', {
    method:  'POST',
    headers: buildHeaders(),
    body:    JSON.stringify({ email, password }),
  });

// ── POST /api/users/ ─────────────────────────────────────────
// Sends:   { name, email, password }
// Returns: { _id, name, email, token }
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
// Returns: { _id, name, email, token }
export const completeLoginWith2FA = (loginToken, code) =>
  apiFetch('/login/2fa', {
    method:  'POST',
    headers: buildHeaders(),
    body:    JSON.stringify({ loginToken, code }),
  });

// ── POST /api/users/logout ────────────────────────────────────
// Revokes the 2FA "remember this login" trust window server-side, so the
// next login always re-challenges. Always clears the local session
// afterward, even if this call fails — a user should never be stuck
// unable to log out locally just because the network request failed.
export const logoutUser = async () => {
  try {
    await apiFetch('/logout', {
      method:  'POST',
      headers: buildHeaders(true),
    });
  } catch {
    // ignore — we still want to clear the local session below
  } finally {
    clearSession();
  }
};

// NOTE: the admin status-change call now lives in services/adminApi.js as
// setUserStatus() — it hits PATCH /api/admin/users/:id/status. The old export
// here was never called and documented a 'deactivated' status that isn't in
// the schema enum (it's 'suspended').

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
export const changePassword = (currentPassword, newPassword, confirmNewPassword) =>
  apiFetch('/me/password', {
    method:  'PATCH',
    headers: buildHeaders(true),
    body:    JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
  });

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
  });

// ── POST /api/users/me/2fa/enable (step 1) ────────────────────
export const requestEnable2FA = () =>
  apiFetch('/me/2fa/enable', {
    method:  'POST',
    headers: buildHeaders(true),
  });

// ── POST /api/users/me/2fa/verify (step 2) ────────────────────
// Sends: { code } — Returns: { twoFactorEnabled: true }
export const confirmEnable2FA = (code) =>
  apiFetch('/me/2fa/verify', {
    method:  'POST',
    headers: buildHeaders(true),
    body:    JSON.stringify({ code }),
  });

// ── POST /api/users/me/2fa/disable ────────────────────────────
// Sends: { password } — Returns: { twoFactorEnabled: false }
export const disable2FA = (password) =>
  apiFetch('/me/2fa/disable', {
    method:  'POST',
    headers: buildHeaders(true),
    body:    JSON.stringify({ password }),
  });

// ── Session helpers ───────────────────────────────────────────
export const persistSession = (token, user) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};
