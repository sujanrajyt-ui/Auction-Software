import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import LandingLoginPage from './pages/LandingLoginPage.jsx';
import SuperAdminDashboard from './pages/SuperAdminDashboard.jsx';
import CommitteeAdminDashboard from './pages/CommitteeAdminDashboard.jsx';
import TeamDashboard from './pages/TeamDashboard.jsx';
import ProjectorView from './pages/ProjectorView.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingLoginPage mode="TEAM" />} />
          <Route path="/admin" element={<LandingLoginPage mode="ADMIN" />} />
          <Route path="/super-admin" element={<SuperAdminDashboard />} />
          <Route path="/admin/auction/:auctionId" element={<CommitteeAdminDashboard />} />
          <Route path="/team/:auctionId" element={<TeamDashboard />} />
          <Route path="/projector/:auctionId" element={<ProjectorView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
