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
        // GET /me returns { id, displayName, email, role } — no nesting
        setUser(data);
      })
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, []);

  // Called after login or signup.
  // loginUser / signupUser both return { _id, name, email, token }.
  // We normalise to { id, name, email } so the shape is consistent
  // with what components read after a page refresh (from /me).
  const login = (rawUser, token) => {
    const user = {
      id:          rawUser._id,
      name:        rawUser.name,
      email:       rawUser.email,
      displayName: rawUser.name,   // /me uses displayName; mirror it here
    };
    persistSession(token, user);
    setUser(user);
  };

  const logout = () => {
    logoutUser();   // clears localStorage
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
