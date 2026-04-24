import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import FormModal from '../components/FormModal';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'invoice_id', label: 'Invoice ID' },
  { key: 'patient_id', label: 'Patient ID' },
  { key: 'patient_name', label: 'Patient Name' },
  { key: 'procedure_code', label: 'Procedure Code' },
  { key: 'procedure_description', label: 'Description' },
  { key: 'amount', label: 'Amount' },
  { key: 'insurance_paid', label: 'Insurance Paid' },
  { key: 'patient_paid', label: 'Patient Paid' },
  { key: 'patient_balance', label: 'Patient Balance' },
  { key: 'status', label: 'Status' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'insurance_provider', label: 'Insurance Provider' },
  { key: 'notes', label: 'Notes' },
];

const formFields = [
  { key: 'invoice_id', label: 'Invoice ID', type: 'text', required: true },
  { key: 'patient_id', label: 'Patient ID', type: 'number', required: true },
  { key: 'procedure_code', label: 'Procedure Code', type: 'text', required: true },
  { key: 'procedure_description', label: 'Description', type: 'text' },
  { key: 'amount', label: 'Amount', type: 'number', required: true },
  { key: 'insurance_paid', label: 'Insurance Paid', type: 'number' },
  { key: 'patient_paid', label: 'Patient Paid', type: 'number' },
  { key: 'patient_balance', label: 'Patient Balance', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['pending', 'partial', 'paid', 'overdue', 'denied'], required: true },
  { key: 'due_date', label: 'Due Date', type: 'date', required: true },
  { key: 'insurance_provider', label: 'Insurance Provider', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

const statusColors = {
  paid: '#28a745',
  pending: '#ffc107',
  partial: '#fd7e14',
  overdue: '#dc3545',
  denied: '#6c757d',
};

function formatCurrency(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return '$0.00';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Billing() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total_billed: 0, total_collected: 0, total_pending: 0, total_overdue: 0 });
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const [res, statsRes] = await Promise.all([
        API().get('/api/billing'),
        API().get('/api/billing/stats').catch(() => ({ data: {} }))
      ]);
      setItems(Array.isArray(res.data) ? res.data : res.data.invoices || res.data.data || []);
      if (statsRes.data) {
        setStats({
          total_billed: statsRes.data.total_billed || 0,
          total_collected: statsRes.data.total_collected || 0,
          total_pending: statsRes.data.total_pending || 0,
          total_overdue: statsRes.data.total_overdue || 0,
        });
      }
    } catch (err) {
      addToast('Failed to load billing data', 'error');
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
        await API().put(`/api/billing/${editItem.id}`, formData);
        addToast('Invoice updated successfully', 'success');
      } else {
        await API().post('/api/billing', formData);
        addToast('Invoice created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save invoice', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete invoice "${item.invoice_id}"?`)) return;
    try {
      await API().delete(`/api/billing/${item.id}`);
      addToast('Invoice deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete invoice', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const handleMarkPaid = async (item) => {
    try {
      await API().put(`/api/billing/${item.id}`, { ...item, status: 'paid', patient_balance: 0 });
      addToast('Invoice marked as paid', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update invoice', 'error');
    }
  };

  const filtered = items.filter(item => {
    if (filterStatus && item.status !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.invoice_id || '').toLowerCase().includes(q) ||
      (item.procedure_code || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Billing Management</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search by invoice ID or procedure code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="denied">Denied</option>
            </select>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Invoice
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', borderLeft: '4px solid #007bff' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '4px' }}>Total Billed</div>
            <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>{formatCurrency(stats.total_billed)}</div>
          </div>
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', borderLeft: '4px solid #28a745' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '4px' }}>Total Collected</div>
            <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>{formatCurrency(stats.total_collected)}</div>
          </div>
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', borderLeft: '4px solid #ffc107' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '4px' }}>Total Pending</div>
            <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>{formatCurrency(stats.total_pending)}</div>
          </div>
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', borderLeft: '4px solid #dc3545' }}>
            <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '4px' }}>Total Overdue</div>
            <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700 }}>{formatCurrency(stats.total_overdue)}</div>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="loading-spinner"></div></div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Patient</th>
                  <th>Procedure Code</th>
                  <th>Amount</th>
                  <th>Insurance Paid</th>
                  <th>Patient Balance</th>
                  <th>Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="8" className="no-data">No invoices found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{item.invoice_id}</td>
                      <td>{item.patient_name || item.patient_id}</td>
                      <td>{item.procedure_code}</td>
                      <td>{formatCurrency(item.amount)}</td>
                      <td>{formatCurrency(item.insurance_paid)}</td>
                      <td>{formatCurrency(item.patient_balance)}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#fff',
                          backgroundColor: statusColors[item.status] || '#6c757d'
                        }}>
                          {item.status}
                        </span>
                      </td>
                      <td>{item.due_date || '-'}</td>
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
                <h2>Invoice Details</h2>
                <button className="modal-close" onClick={() => setSelectedItem(null)}>&times;</button>
              </div>
              <div className="modal-body">
                {detailFields.map(f => (
                  <div key={f.key} className="detail-row">
                    <span className="detail-label">{f.label}:</span>
                    <span className="detail-value">
                      {['amount', 'insurance_paid', 'patient_paid', 'patient_balance'].includes(f.key)
                        ? formatCurrency(selectedItem[f.key])
                        : f.key === 'status'
                          ? (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: '#fff',
                              backgroundColor: statusColors[selectedItem.status] || '#6c757d'
                            }}>
                              {selectedItem.status}
                            </span>
                          )
                          : String(selectedItem[f.key] ?? '-')
                      }
                    </span>
                  </div>
                ))}
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedItem.status !== 'paid' && (
                  <button className="btn btn-success" onClick={() => handleMarkPaid(selectedItem)}>
                    Mark Paid
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => handleEdit(selectedItem)}>Edit</button>
                <button className="btn btn-danger" onClick={() => handleDelete(selectedItem)}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <FormModal
            item={editItem}
            fields={formFields}
            title={editItem ? 'Edit Invoice' : 'New Invoice'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default Billing;
