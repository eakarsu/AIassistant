import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Images from './pages/Images';
import Analysis from './pages/Analysis';
import Studies from './pages/Studies';
import Reports from './pages/Reports';
import Patients from './pages/Patients';
import Radiologists from './pages/Radiologists';
import Departments from './pages/Departments';
import ReferringPhysicians from './pages/ReferringPhysicians';
import Appointments from './pages/Appointments';
import Billing from './pages/Billing';
import AuditLog from './pages/AuditLog';
import Notifications from './pages/Notifications';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Analytics from './pages/Analytics';
import AIHub from './pages/AIHub';
import Extensions from './pages/Extensions';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/images" element={<ProtectedRoute><Images /></ProtectedRoute>} />
        <Route path="/analysis" element={<ProtectedRoute><Analysis /></ProtectedRoute>} />
        <Route path="/studies" element={<ProtectedRoute><Studies /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/patients" element={<ProtectedRoute><Patients /></ProtectedRoute>} />
        <Route path="/radiologists" element={<ProtectedRoute><Radiologists /></ProtectedRoute>} />
        <Route path="/departments" element={<ProtectedRoute><Departments /></ProtectedRoute>} />
        <Route path="/referring-physicians" element={<ProtectedRoute><ReferringPhysicians /></ProtectedRoute>} />
        <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
        <Route path="/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="/ai-hub" element={<ProtectedRoute><AIHub /></ProtectedRoute>} />
        <Route path="/extensions" element={<ProtectedRoute><Extensions /></ProtectedRoute>} />
      </Routes>
    </div>
  );
}

export default App;
