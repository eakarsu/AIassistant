import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '\u2302' },
  { section: 'Clinical' },
  { path: '/images', label: 'Images', icon: '\uD83D\uDD2C' },
  { path: '/analysis', label: 'AI Analysis', icon: '\uD83E\uDDE0' },
  { path: '/studies', label: 'Prior Studies', icon: '\uD83D\uDCDA' },
  { path: '/reports', label: 'Reports', icon: '\uD83D\uDCCB' },
  { section: 'Operations' },
  { path: '/appointments', label: 'Appointments', icon: '\uD83D\uDCC5' },
  { path: '/patients', label: 'Patients', icon: '\uD83D\uDC64' },
  { path: '/referring-physicians', label: 'Referring Docs', icon: '\uD83D\uDCE8' },
  { path: '/billing', label: 'Billing', icon: '\uD83D\uDCB0' },
  { section: 'Administration' },
  { path: '/radiologists', label: 'Radiologists', icon: '\uD83D\uDC68\u200D\u2695\uFE0F' },
  { path: '/departments', label: 'Departments', icon: '\uD83C\uDFE5' },
  { path: '/users', label: 'Users', icon: '\uD83D\uDD12' },
  { path: '/analytics', label: 'Analytics', icon: '\uD83D\uDCCA' },
  { path: '/audit-log', label: 'Audit Log', icon: '\uD83D\uDDD2' },
  { path: '/notifications', label: 'Notifications', icon: '\uD83D\uDD14' },
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
        <span className="logo-icon">{'\u2695\uFE0F'}</span>
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
          <span className="nav-icon">{'\uD83D\uDEAA'}</span>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
