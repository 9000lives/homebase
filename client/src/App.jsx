// ============================================================
//  src/App.jsx
//  Root component.  Sets up routing and wraps everything in
//  AuthProvider so any component can call useAuth().
// ============================================================

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login     from './pages/Login';
import Signup    from './pages/Signup';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';

// ✏️  Import your own pages here, e.g.:
// import Dashboard from './pages/Dashboard';
// import Settings  from './pages/Settings';

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

          {/* ✏️  Add more protected routes here, e.g.:
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/profile"  element={<ProtectedRoute><Profile  /></ProtectedRoute>} />
          */}

          {/* ── Root redirect ── */}
          {/* Sends "/" → "/dashboard" which then redirects to /login if not authed */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* ── 404 catch-all ── */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
