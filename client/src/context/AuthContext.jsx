// ============================================================
//  src/context/AuthContext.jsx
// ============================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  verifyToken,
  logoutUser,
  persistSession,
  clearSession,
  getStoredToken,
} from '../services/authApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setLoading(false); return; }

    verifyToken()
      .then((data) => {
        // GET /me returns { id, displayName, email, role, twoFactorEnabled } — no nesting
        setUser(data);
      })
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, []);

  // Called after login or signup.
  // loginUser / signupUser both return { _id, name, email, token, twoFactorEnabled }.
  // We normalise to { id, name, email } so the shape is consistent
  // with what components read after a page refresh (from /me).
  const login = (rawUser, token) => {
    const user = {
      id:          rawUser._id,
      name:        rawUser.name,
      email:       rawUser.email,
      displayName: rawUser.name,   // /me uses displayName; mirror it here
      twoFactorEnabled: !!rawUser.twoFactorEnabled,
    };
    persistSession(token, user);
    setUser(user);
  };

  const logout = async () => {
    await logoutUser();   // revokes the 2FA trust window server-side, then clears localStorage
    setUser(null);
  };

  // Re-fetches /me and refreshes the cached user object — used after
  // settings changes (username, 2FA) so the UI reflects the new state
  // without a full page reload.
  const refreshUser = async () => {
    const data = await verifyToken();
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
