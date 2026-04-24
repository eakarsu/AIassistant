import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import DetailModal from '../components/DetailModal';
import FormModal from '../components/FormModal';
import AIOutput from '../components/AIOutput';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'report_id', label: 'Report ID' },
  { key: 'image_id', label: 'Image ID' },
  { key: 'patient_id', label: 'Patient ID' },
  { key: 'radiologist_id', label: 'Radiologist ID' },
  { key: 'report_type', label: 'Report Type' },
  { key: 'clinical_history', label: 'Clinical History' },
  { key: 'technique', label: 'Technique' },
  { key: 'findings', label: 'Findings' },
  { key: 'impression', label: 'Impression' },
  { key: 'recommendations', label: 'Recommendations' },
  { key: 'status', label: 'Status' },
  { key: 'is_compliant', label: 'Compliant' },
  { key: 'signed_date', label: 'Signed Date' },
];

const formFields = [
  { key: 'report_id', label: 'Report ID', type: 'text', required: true },
  { key: 'image_id', label: 'Image ID', type: 'number' },
  { key: 'patient_id', label: 'Patient ID', type: 'number', required: true },
  { key: 'radiologist_id', label: 'Radiologist ID', type: 'number' },
  { key: 'report_type', label: 'Report Type', type: 'select', required: true, options: [
    'diagnostic', 'follow_up', 'screening', 'emergency', 'consultation'
  ]},
  { key: 'clinical_history', label: 'Clinical History', type: 'textarea' },
  { key: 'technique', label: 'Technique', type: 'textarea' },
  { key: 'findings', label: 'Findings', type: 'textarea' },
  { key: 'impression', label: 'Impression', type: 'textarea' },
  { key: 'recommendations', label: 'Recommendations', type: 'textarea' },
  { key: 'status', label: 'Status', type: 'select', options: ['draft', 'ai_generated', 'reviewed', 'finalized'] },
];

function Reports() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const res = await API().get('/api/reports');
      setItems(Array.isArray(res.data) ? res.data : res.data.reports || res.data.data || []);
    } catch (err) {
      addToast('Failed to load reports', 'error');
    } finally {
      setLoading(false);
    }
  }, [API, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (formData) => {
    try {
      if (editItem) {
        await API().put(`/api/reports/${editItem.id}`, formData);
        addToast('Report updated successfully', 'success');
      } else {
        await API().post('/api/reports', formData);
        addToast('Report created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save report', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete report "${item.report_id}"?`)) return;
    try {
      await API().delete(`/api/reports/${item.id}`);
      addToast('Report deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete report', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const handleGenerateDraft = async () => {
    if (!selectedItem) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await API().post(`/api/reports/${selectedItem.id}/generate-draft`);
      setAiResult(res.data);
      addToast('AI draft generated successfully', 'success');
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to generate AI draft', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleComplianceCheck = async () => {
    if (!selectedItem) return;
    setActionLoading('compliance');
    try {
      const res = await API().post(`/api/reports/${selectedItem.id}/compliance-check`);
      addToast(res.data.message || 'Compliance check completed', 'success');
      fetchData();
      setSelectedItem(prev => prev ? { ...prev, is_compliant: true } : null);
    } catch (err) {
      addToast(err.response?.data?.error || 'Compliance check failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleFinalize = async () => {
    if (!selectedItem) return;
    setActionLoading('finalize');
    try {
      const res = await API().post(`/api/reports/${selectedItem.id}/finalize`);
      addToast(res.data.message || 'Report finalized successfully', 'success');
      fetchData();
      setSelectedItem(prev => prev ? { ...prev, status: 'finalized' } : null);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to finalize report', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const getStatusBadge = (status) => {
    const cls = status === 'finalized' ? 'badge-success' :
                status === 'ai_generated' ? 'badge-info' :
                status === 'reviewed' ? 'badge-warning' : 'badge-neutral';
    return <span className={`badge ${cls}`}>{status || 'draft'}</span>;
  };

  const filtered = items.filter(item => {
    const matchesSearch = !search ||
      (item.report_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.report_type || '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.patient_id || '').includes(search);
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Report Generation</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search reports..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="All">All Status</option>
              <option value="draft">Draft</option>
              <option value="ai_generated">AI Generated</option>
              <option value="reviewed">Reviewed</option>
              <option value="finalized">Finalized</option>
            </select>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Report
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="loading-spinner"></div></div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Patient</th>
                  <th>Radiologist</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Compliance</th>
                  <th>Signed Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">No reports found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => { setSelectedItem(item); setAiResult(null); }}>
                      <td>{item.report_id}</td>
                      <td>{item.patient_id}</td>
                      <td>{item.radiologist_id || '-'}</td>
                      <td>{item.report_type}</td>
                      <td>{getStatusBadge(item.status)}</td>
                      <td>
                        {item.is_compliant ?
                          <span className="check-yes">{'\u2714'}</span> :
                          <span className="check-no">{'\u2718'}</span>
                        }
                      </td>
                      <td>{item.signed_date || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {selectedItem && (
          <DetailModal
            item={selectedItem}
            fields={detailFields}
            title="Report Details"
            onClose={() => { setSelectedItem(null); setAiResult(null); }}
            onEdit={handleEdit}
            onDelete={handleDelete}
          >
            <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="btn btn-ai"
                onClick={handleGenerateDraft}
                disabled={aiLoading}
              >
                {'\uD83E\uDDE0'} {aiLoading ? 'Generating...' : 'Generate AI Draft'}
              </button>
              <button
                className="btn btn-warning btn-sm"
                onClick={handleComplianceCheck}
                disabled={actionLoading === 'compliance'}
              >
                {actionLoading === 'compliance' ? 'Checking...' : 'Mark Compliant'}
              </button>
              <button
                className="btn btn-success btn-sm"
                onClick={handleFinalize}
                disabled={actionLoading === 'finalize' || selectedItem.status === 'finalized'}
              >
                {actionLoading === 'finalize' ? 'Finalizing...' : selectedItem.status === 'finalized' ? 'Already Finalized' : 'Finalize Report'}
              </button>
            </div>
            {(aiLoading || aiResult) && (
              <AIOutput data={aiResult} type="report" isLoading={aiLoading} />
            )}
          </DetailModal>
        )}

        {showForm && (
          <FormModal
            item={editItem}
            fields={formFields}
            title={editItem ? 'Edit Report' : 'New Report'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default Reports;
