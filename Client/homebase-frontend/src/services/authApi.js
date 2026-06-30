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
// Returns: { id, displayName, email, role }
export const verifyToken = () =>
  apiFetch('/me', {
    method:  'GET',
    headers: buildHeaders(true),
  });

// ── No logout endpoint — just wipe the local session ─────────
export const logoutUser = () => {
  clearSession();
};

// ── PATCH /api/users/:id/status (admin only) ─────────────────
// Sends:   { status: 'active' | 'deactivated' | 'pending' }
// Returns: { _id, name, email, status }
export const updateUserStatus = (userId, status) =>
  apiFetch(`/${userId}/status`, {
    method:  'PATCH',
    headers: buildHeaders(true),
    body:    JSON.stringify({ status }),
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
