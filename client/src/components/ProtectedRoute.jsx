// ============================================================
//  src/components/ProtectedRoute.jsx
//  Wrap any route that requires authentication.
//  Redirects to /login if the user is not signed in.
// ============================================================

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingDots from './LoadingDots';

/**
 * Usage in App.jsx:
 *
 *   <Route path="/dashboard" element={
 *     <ProtectedRoute>
 *       <Dashboard />
 *     </ProtectedRoute>
 *   } />
 */
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Still verifying the stored token — render nothing (or a loader)
  if (loading) return <LoadingDots fullScreen />;

  // Not logged in → send to /login, remembering where they were headed
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
