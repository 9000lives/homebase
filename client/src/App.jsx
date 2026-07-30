// ============================================================
//  src/App.jsx
//  Root component.  Sets up routing and wraps everything in
//  AuthProvider so any component can call useAuth().
// ============================================================

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login     from './pages/Login';
import Signup    from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Settings  from './pages/Settings';
import Admin     from './pages/Admin';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute     from './components/AdminRoute';

// ── PublicRoute ───────────────────────────────────────────────
// If the user IS already logged in, redirect them away from
// /login and /signup to the main app instead.
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};

// ── App ───────────────────────────────────────────────────────
function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>

            {/* ── Public routes (redirect to /dashboard if already logged in) ── */}
            <Route path="/login"  element={<PublicRoute><Login  /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />

            {/* ── Protected routes (redirect to /login if NOT logged in) ── */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />

            {/* ── Admin-only route (redirects non-admins to /dashboard) ── */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />

            {/* ── Root redirect ── */}
            {/* Sends "/" → "/dashboard" which then redirects to /login if not authed */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* ── 404 catch-all ── */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />

          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
