import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { section: 'Clinical' },
  { path: '/images', label: 'Images', icon: '🔬' },
  { path: '/analysis', label: 'AI Analysis', icon: '🧠' },
  { path: '/ai-hub', label: 'AI Hub', icon: '✨' },
  { path: '/studies', label: 'Prior Studies', icon: '📚' },
  { path: '/reports', label: 'Reports', icon: '📋' },
  { section: 'Operations' },
  { path: '/appointments', label: 'Appointments', icon: '📅' },
  { path: '/patients', label: 'Patients', icon: '👤' },
  { path: '/referring-physicians', label: 'Referring Docs', icon: '📨' },
  { path: '/billing', label: 'Billing', icon: '💰' },
  { section: 'Administration' },
  { path: '/radiologists', label: 'Radiologists', icon: '👨‍⚕️' },
  { path: '/departments', label: 'Departments', icon: '🏥' },
  { path: '/users', label: 'Users', icon: '🔒' },
  { path: '/analytics', label: 'Analytics', icon: '📊' },
  { path: '/audit-log', label: 'Audit Log', icon: '🗒' },
  { path: '/notifications', label: 'Notifications', icon: '🔔' },
  { path: '/extensions', label: 'Extensions', icon: '🔌' },
  { path: '/custom-views', label: 'Assistant Views', icon: '🪄' },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user.name || user.email || 'User';
  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">{'⚕️'}</span>
        <h2>Radiology<span>AI</span></h2>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, idx) => {
          if (item.section) {
            return (
              <div key={idx} className="sidebar-section">
                {item.section}
              </div>
            );
          }
          return (
            <Link
              key={item.path}
              to={item.path}
              className={location.pathname === item.path ? 'active' : ''}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }}>
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{userName}</div>
            <div className="user-role">{user.role || 'User'}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          <span className="nav-icon">{'🚪'}</span>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
