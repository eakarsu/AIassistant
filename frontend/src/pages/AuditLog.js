import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import { ToastContainer, useToast } from '../components/Toast';

const actionColors = {
  CREATE: '#28a745',
  UPDATE: '#007bff',
  DELETE: '#dc3545',
  LOGIN: '#6f42c1',
  VIEW: '#6c757d',
};

function formatTimestamp(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function AuditLog() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const res = await API().get('/api/audit-logs');
      setItems(Array.isArray(res.data) ? res.data : res.data.logs || res.data.data || []);
    } catch (err) {
      addToast('Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }, [API, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = items.filter(item => {
    if (filterAction && item.action !== filterAction) return false;
    if (filterEntity && item.entity_type !== filterEntity) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.user_name || item.user || '').toLowerCase().includes(q) ||
      (item.details || '').toLowerCase().includes(q)
    );
  });

  const detailFields = [
    { key: 'id', label: 'ID' },
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'user_name', label: 'User' },
    { key: 'user_id', label: 'User ID' },
    { key: 'action', label: 'Action' },
    { key: 'entity_type', label: 'Entity Type' },
    { key: 'entity_id', label: 'Entity ID' },
    { key: 'details', label: 'Details' },
    { key: 'ip_address', label: 'IP Address' },
  ];

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Audit Log</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search by user or details..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="LOGIN">Login</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
              <option value="VIEW">View</option>
            </select>
            <select
              className="filter-select"
              value={filterEntity}
              onChange={e => setFilterEntity(e.target.value)}
            >
              <option value="">All Entity Types</option>
              <option value="auth">Auth</option>
              <option value="patient">Patient</option>
              <option value="radiologist">Radiologist</option>
              <option value="image">Image</option>
              <option value="analysis">Analysis</option>
              <option value="study">Study</option>
              <option value="report">Report</option>
              <option value="appointment">Appointment</option>
              <option value="billing">Billing</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="loading-spinner"></div></div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Entity ID</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="6" className="no-data">No audit logs found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{formatTimestamp(item.timestamp || item.created_at)}</td>
                      <td>{item.user_name || item.user || '-'}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#fff',
                          backgroundColor: actionColors[item.action] || '#6c757d'
                        }}>
                          {item.action}
                        </span>
                      </td>
                      <td>{item.entity_type || '-'}</td>
                      <td>{item.entity_id || '-'}</td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.details || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedItem && (
          <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Audit Log Details</h2>
                <button className="modal-close" onClick={() => setSelectedItem(null)}>&times;</button>
              </div>
              <div className="modal-body">
                {detailFields.map(f => (
                  <div key={f.key} className="detail-row">
                    <span className="detail-label">{f.label}:</span>
                    <span className="detail-value">
                      {f.key === 'timestamp'
                        ? formatTimestamp(selectedItem.timestamp || selectedItem.created_at)
                        : f.key === 'action'
                          ? (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: '#fff',
                              backgroundColor: actionColors[selectedItem.action] || '#6c757d'
                            }}>
                              {selectedItem.action}
                            </span>
                          )
                          : String(selectedItem[f.key] ?? '-')
                      }
                    </span>
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setSelectedItem(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLog;
