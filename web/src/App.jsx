import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/auth';
import Layout from './components/Layout';

import Login                  from './pages/Login';
import InputDeliveries        from './pages/InputDeliveries';
import NationalKPI            from './pages/NationalKPI';
import NDCOperations          from './pages/NDCOperations';
import DistributionTracker    from './pages/DistributionTracker';
import Notifications          from './pages/Notifications';
import DistributorRegistration from './pages/DistributorRegistration';
import SPRegistration         from './pages/SPRegistration';
import UserManagement         from './pages/UserManagement';
import FarmerApprovals        from './pages/FarmerApprovals';
import AuditTrail             from './pages/AuditTrail';
import DemoSimulator          from './pages/DemoSimulator';
import DataExplorer           from './pages/DataExplorer';

function RequireAuth({ children }) {
  const { user } = useAuthStore();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Default — go straight to Dashboard */}
      <Route path="/" element={<RequireAuth><Navigate to="/dashboard" replace /></RequireAuth>} />

      {/* DoCs section — all pages wrapped in Layout (sidebar) */}
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/dashboard"         element={<NationalKPI />} />
        <Route path="/ndc"               element={<NDCOperations />} />
        <Route path="/distribution"      element={<DistributionTracker />} />
        <Route path="/notifications"     element={<Notifications />} />
        <Route path="/distributors"      element={<DistributorRegistration />} />
        <Route path="/service-providers" element={<SPRegistration />} />
        <Route path="/users"             element={<UserManagement />} />
        <Route path="/approvals"         element={<FarmerApprovals />} />
        <Route path="/audit"             element={<AuditTrail />} />
        <Route path="/simulator"         element={<DemoSimulator />} />
        <Route path="/database"          element={<DataExplorer />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
