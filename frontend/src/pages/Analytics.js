import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import { ToastContainer, useToast } from '../components/Toast';

function Analytics() {
  const [dashStats, setDashStats] = useState({});
  const [billingStats, setBillingStats] = useState({});
  const [imagesByModality, setImagesByModality] = useState([]);
  const [reportsByStatus, setReportsByStatus] = useState([]);
  const [billingByStatus, setBillingByStatus] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, billingRes, imagesRes, reportsRes, billingListRes, auditRes] = await Promise.all([
        API().get('/api/dashboard/stats').catch(() => ({ data: {} })),
        API().get('/api/billing/stats').catch(() => ({ data: {} })),
        API().get('/api/images').catch(() => ({ data: [] })),
        API().get('/api/reports').catch(() => ({ data: [] })),
        API().get('/api/billing').catch(() => ({ data: [] })),
        API().get('/api/audit-logs').catch(() => ({ data: [] })),
      ]);

      setDashStats(dashRes.data || {});
      setBillingStats(billingRes.data || {});

      // Images by modality
      const images = Array.isArray(imagesRes.data) ? imagesRes.data : imagesRes.data.images || imagesRes.data.data || [];
      const modalityCounts = {};
      images.forEach(img => {
        const mod = img.modality || 'Unknown';
        modalityCounts[mod] = (modalityCounts[mod] || 0) + 1;
      });
      setImagesByModality(Object.entries(modalityCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));

      // Reports by status
      const reports = Array.isArray(reportsRes.data) ? reportsRes.data : reportsRes.data.reports || reportsRes.data.data || [];
      const reportStatusCounts = {};
      reports.forEach(r => {
        const st = r.status || 'unknown';
        reportStatusCounts[st] = (reportStatusCounts[st] || 0) + 1;
      });
      setReportsByStatus(Object.entries(reportStatusCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));

      // Billing by status
      const invoices = Array.isArray(billingListRes.data) ? billingListRes.data : billingListRes.data.invoices || billingListRes.data.data || [];
      const billingStatusCounts = {};
      invoices.forEach(inv => {
        const st = inv.status || 'unknown';
        billingStatusCounts[st] = (billingStatusCounts[st] || 0) + 1;
      });
      setBillingByStatus(Object.entries(billingStatusCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));

      // Recent activity
      const logs = Array.isArray(auditRes.data) ? auditRes.data : auditRes.data.logs || auditRes.data.data || [];
      setRecentActivity(logs.slice(0, 5));

    } catch (err) {
      addToast('Failed to load analytics data', 'error');
    } finally {
      setLoading(false);
    }
  }, [API, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '$0';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const barColors = ['#4f46e5', '#007bff', '#28a745', '#fd7e14', '#dc3545', '#6f42c1', '#ffc107', '#20c997', '#e83e8c', '#6c757d'];

  const statusBarColors = {
    completed: '#28a745', draft: '#ffc107', pending: '#fd7e14', final: '#007bff', approved: '#28a745',
    paid: '#28a745', partial: '#fd7e14', overdue: '#dc3545', denied: '#6c757d',
  };

  const actionColors = {
    CREATE: '#28a745', UPDATE: '#007bff', DELETE: '#dc3545', LOGIN: '#6f42c1', VIEW: '#6c757d',
  };

  const renderBarChart = (data, colorMap) => {
    const max = Math.max(...data.map(d => d.count), 1);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.map((item, i) => (
          <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#94a3b8', fontSize: '0.85rem', minWidth: '100px', textAlign: 'right' }}>
              {item.name}
            </span>
            <div style={{ flex: 1, background: '#0f172a', borderRadius: '4px', height: '24px', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(item.count / max) * 100}%`,
                backgroundColor: colorMap ? (colorMap[item.name] || barColors[i % barColors.length]) : barColors[i % barColors.length],
                borderRadius: '4px',
                transition: 'width 0.5s ease',
                minWidth: '2px',
              }} />
            </div>
            <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, minWidth: '40px' }}>
              {item.count}
            </span>
          </div>
        ))}
        {data.length === 0 && (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No data available</div>
        )}
      </div>
    );
  };

  const cardStyle = {
    background: '#1e293b',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid #334155',
  };

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Analytics Dashboard</h1>
        </div>

        {loading ? (
          <div className="loading-container"><div className="loading-spinner"></div></div>
        ) : (
          <>
            {/* Row 1: Summary Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}>
              {[
                { label: 'Total Patients', value: dashStats.total_patients || dashStats.patients || 0, color: '#4f46e5' },
                { label: 'Total Images', value: dashStats.total_images || dashStats.images || 0, color: '#007bff' },
                { label: 'Total Reports', value: dashStats.total_reports || dashStats.reports || 0, color: '#28a745' },
                { label: 'Revenue', value: formatCurrency(billingStats.total_collected || billingStats.total_billed || 0), color: '#fd7e14', isText: true },
              ].map(stat => (
                <div key={stat.label} style={{ ...cardStyle, borderLeft: `4px solid ${stat.color}` }}>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '4px' }}>{stat.label}</div>
                  <div style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 700 }}>
                    {stat.isText ? stat.value : Number(stat.value).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Row 2: Images by Modality */}
            <div style={{ ...cardStyle, marginBottom: '24px' }}>
              <h3 style={{ color: '#e2e8f0', margin: '0 0 20px 0' }}>Images by Modality</h3>
              {renderBarChart(imagesByModality)}
            </div>

            {/* Row 3: Reports by Status + Billing by Status */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              marginBottom: '24px',
            }}>
              <div style={cardStyle}>
                <h3 style={{ color: '#e2e8f0', margin: '0 0 20px 0' }}>Reports by Status</h3>
                {renderBarChart(reportsByStatus, statusBarColors)}
              </div>
              <div style={cardStyle}>
                <h3 style={{ color: '#e2e8f0', margin: '0 0 20px 0' }}>Billing by Status</h3>
                {renderBarChart(billingByStatus, statusBarColors)}
              </div>
            </div>

            {/* Row 4: Recent Activity */}
            <div style={cardStyle}>
              <h3 style={{ color: '#e2e8f0', margin: '0 0 20px 0' }}>Recent Activity</h3>
              {recentActivity.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No recent activity</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentActivity.map((log, i) => (
                    <div key={log.id || i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      background: '#0f172a',
                      borderRadius: '8px',
                      borderLeft: `3px solid ${actionColors[log.action] || '#6c757d'}`,
                    }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#fff',
                        backgroundColor: actionColors[log.action] || '#6c757d',
                        flexShrink: 0,
                      }}>
                        {log.action}
                      </span>
                      <span style={{ color: '#e2e8f0', fontSize: '0.9rem', flex: 1 }}>
                        <strong>{log.user_name || log.user || 'System'}</strong>
                        {' '}{(log.action || '').toLowerCase()} {log.entity_type || ''} {log.entity_id ? `#${log.entity_id}` : ''}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '0.8rem', flexShrink: 0 }}>
                        {log.timestamp || log.created_at
                          ? new Date(log.timestamp || log.created_at).toLocaleString()
                          : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Analytics;
