import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const API = axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line
  }, []);

  const fetchStats = async () => {
    try {
      const res = await API.get('/api/dashboard/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const cards = [
    {
      icon: '\uD83D\uDCC5',
      title: 'Appointments',
      description: 'Schedule and manage patient exams',
      stat: stats.appointments || 0,
      statLabel: 'appointments',
      sub: stats.todays_appointments ? `${stats.todays_appointments} today` : null,
      path: '/appointments',
    },
    {
      icon: '\uD83D\uDD2C',
      title: 'Radiology Images',
      description: 'Manage and de-identify medical images',
      stat: stats.images || 0,
      statLabel: 'images',
      sub: stats.pending_images ? `${stats.pending_images} pending` : null,
      path: '/images',
    },
    {
      icon: '\uD83E\uDDE0',
      title: 'AI Image Analysis',
      description: 'AI-powered detection and highlighting',
      stat: stats.analyses || 0,
      statLabel: 'analyses',
      path: '/analysis',
    },
    {
      icon: '\uD83D\uDCDA',
      title: 'Prior Studies Search',
      description: 'Search millions of anonymized studies',
      stat: stats.studies || 0,
      statLabel: 'studies',
      path: '/studies',
    },
    {
      icon: '\uD83D\uDCCB',
      title: 'Report Generation',
      description: 'AI-assisted compliant reports',
      stat: stats.reports || 0,
      statLabel: 'reports',
      sub: stats.draft_reports ? `${stats.draft_reports} drafts` : null,
      path: '/reports',
    },
    {
      icon: '\uD83D\uDC64',
      title: 'Patient Management',
      description: 'Manage patient records',
      stat: stats.patients || 0,
      statLabel: 'patients',
      path: '/patients',
    },
    {
      icon: '\uD83D\uDCE8',
      title: 'Referring Physicians',
      description: 'Manage referring doctor contacts',
      stat: stats.referring_physicians || 0,
      statLabel: 'physicians',
      path: '/referring-physicians',
    },
    {
      icon: '\uD83D\uDCB0',
      title: 'Billing',
      description: 'Invoices and payment tracking',
      stat: stats.invoices || 0,
      statLabel: 'invoices',
      sub: stats.total_revenue ? `$${stats.total_revenue.toLocaleString()} revenue` : null,
      path: '/billing',
    },
    {
      icon: '\uD83D\uDC68\u200D\u2695\uFE0F',
      title: 'Radiologist Management',
      description: 'Manage radiology team',
      stat: stats.radiologists || 0,
      statLabel: 'radiologists',
      path: '/radiologists',
    },
    {
      icon: '\uD83C\uDFE5',
      title: 'Departments',
      description: 'Organizational departments',
      stat: stats.departments || 0,
      statLabel: 'departments',
      path: '/departments',
    },
    {
      icon: '\uD83D\uDCCA',
      title: 'Analytics',
      description: 'Charts, statistics, and insights',
      stat: null,
      statLabel: 'View analytics',
      path: '/analytics',
    },
    {
      icon: '\uD83D\uDDD2',
      title: 'Audit Log',
      description: 'Track all system activity',
      stat: null,
      statLabel: 'View logs',
      path: '/audit-log',
    },
  ];

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <div className="dashboard-header">
          <h1>Welcome back, {user.name || user.email || 'User'}</h1>
          <p>Healthcare Intelligence Platform Overview</p>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
          </div>
        ) : (
          <div className="dashboard-grid">
            {cards.map((card, i) => (
              <div
                key={i}
                className="dashboard-card"
                onClick={() => navigate(card.path)}
              >
                <span className="card-icon">{card.icon}</span>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <div className="card-stat">
                  {card.stat !== null ? (
                    <span className="card-stat-number">{card.stat}</span>
                  ) : null}
                  <span>{card.statLabel}</span>
                </div>
                {card.sub && (
                  <div className="card-sub-stat">{card.sub}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
