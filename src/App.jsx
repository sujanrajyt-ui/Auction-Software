import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import LandingLoginPage from './pages/LandingLoginPage.jsx';
import SuperAdminDashboard from './pages/SuperAdminDashboard.jsx';
import CommitteeAdminDashboard from './pages/CommitteeAdminDashboard.jsx';
import TeamDashboard from './pages/TeamDashboard.jsx';
import ProjectorView from './pages/ProjectorView.jsx';
import PlayersDirectoryPage from './pages/PlayersDirectoryPage.jsx';

function AdminRoute({ children, superAdminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090E] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user || user.kind !== 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  if (superAdminOnly && user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function TeamRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090E] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user || user.kind !== 'TEAM') {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingLoginPage mode="TEAM" />} />
          <Route path="/admin" element={<LandingLoginPage mode="ADMIN" />} />
          <Route
            path="/super-admin"
            element={
              <AdminRoute superAdminOnly>
                <SuperAdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/auction/:auctionId"
            element={
              <AdminRoute>
                <CommitteeAdminDashboard />
              </AdminRoute>
            }
          />
          <Route
            path="/team/:auctionId"
            element={
              <TeamRoute>
                <TeamDashboard />
              </TeamRoute>
            }
          />
          <Route path="/projector/:auctionId" element={<ProjectorView />} />
          <Route path="/players/:auctionId" element={<PlayersDirectoryPage />} />
          <Route path="/auction/:auctionId/players" element={<PlayersDirectoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
