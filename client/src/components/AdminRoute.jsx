// ============================================================
//  src/components/AdminRoute.jsx
//  Route guard for the admin dashboard. Wraps ProtectedRoute rather
//  than duplicating it, so the session check (and its loading state)
//  always resolves BEFORE the role check runs.
//
//  This is UX only — requireAdmin on the server is the real gate.
// ============================================================

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';

// Only ever rendered once ProtectedRoute has confirmed a session, so `user`
// is guaranteed non-null here.
const AdminGate = ({ children }) => {
  const { user } = useAuth();
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
};

const AdminRoute = ({ children }) => (
  <ProtectedRoute>
    <AdminGate>{children}</AdminGate>
  </ProtectedRoute>
);

export default AdminRoute;
