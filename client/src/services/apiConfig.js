// ============================================================
//  src/services/apiConfig.js
//  Where the API lives. Nothing else.
//
//  This module imports NOTHING on purpose. apiClient.js needs the token
//  getter from authApi.js, and authApi.js needs the origin — pointing
//  those two at each other is a cycle, and whichever the bundler happens
//  to evaluate second reads the other's consts from the temporal dead
//  zone and throws at import time. A leaf both can depend on avoids it.
// ============================================================

// Override in client/.env. See client/.env.example — the value is constrained
// by the server's CORS allow-list and its Cross-Origin-Resource-Policy, not
// just by whether the host is reachable.
export const API_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const FILES_API_URL         = `${API_ORIGIN}/api/files`;
export const FOLDERS_API_URL       = `${API_ORIGIN}/api/folders`;
export const USERS_API_URL         = `${API_ORIGIN}/api/users`;
export const ADMIN_API_URL         = `${API_ORIGIN}/api/admin`;
export const ANNOUNCEMENTS_API_URL = `${API_ORIGIN}/api/announcements`;
