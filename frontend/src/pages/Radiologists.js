import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import DetailModal from '../components/DetailModal';
import FormModal from '../components/FormModal';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'employee_id', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'specialization', label: 'Specialization' },
  { key: 'license_number', label: 'License Number' },
  { key: 'years_experience', label: 'Years of Experience' },
  { key: 'phone', label: 'Phone' },
  { key: 'department', label: 'Department' },
  { key: 'status', label: 'Status' },
  { key: 'certifications', label: 'Certifications' },
];

const formFields = [
  { key: 'employee_id', label: 'Employee ID', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'specialization', label: 'Specialization', type: 'select', required: true, options: [
    'Neuroradiology', 'Musculoskeletal', 'Cardiothoracic', 'Abdominal',
    'Breast Imaging', 'Pediatric', 'Interventional', 'Nuclear Medicine', 'Emergency'
  ]},
  { key: 'license_number', label: 'License Number', type: 'text', required: true },
  { key: 'years_experience', label: 'Years of Experience', type: 'number' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'department', label: 'Department', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'on_leave', 'inactive'] },
  { key: 'certifications', label: 'Certifications', type: 'textarea' },
];

function Radiologists() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
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
      const res = await API().get('/api/radiologists');
      setItems(Array.isArray(res.data) ? res.data : res.data.radiologists || res.data.data || []);
    } catch (err) {
      addToast('Failed to load radiologists', 'error');
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
        await API().put(`/api/radiologists/${editItem.id}`, formData);
        addToast('Radiologist updated successfully', 'success');
      } else {
        await API().post('/api/radiologists', formData);
        addToast('Radiologist created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save radiologist', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete radiologist "${item.name}"?`)) return;
    try {
      await API().delete(`/api/radiologists/${item.id}`);
      addToast('Radiologist deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete radiologist', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const getStatusBadge = (status) => {
    const cls = status === 'active' ? 'badge-success' : status === 'on_leave' ? 'badge-warning' : 'badge-danger';
    return <span className={`badge ${cls}`}>{status || 'N/A'}</span>;
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.employee_id || '').toLowerCase().includes(q) ||
      (item.specialization || '').toLowerCase().includes(q) ||
      (item.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Radiologist Management</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search radiologists..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Radiologist
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
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Specialization</th>
                  <th>License #</th>
                  <th>Years Exp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">No radiologists found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{item.employee_id}</td>
                      <td>{item.name}</td>
                      <td>{item.email}</td>
                      <td>{item.specialization}</td>
                      <td>{item.license_number}</td>
                      <td>{item.years_experience || '-'}</td>
                      <td>{getStatusBadge(item.status)}</td>
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
            title="Radiologist Details"
            onClose={() => setSelectedItem(null)}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {showForm && (
          <FormModal
            item={editItem}
            fields={formFields}
            title={editItem ? 'Edit Radiologist' : 'New Radiologist'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default Radiologists;
