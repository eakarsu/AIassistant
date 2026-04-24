import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import DetailModal from '../components/DetailModal';
import FormModal from '../components/FormModal';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'physician_id', label: 'Physician ID' },
  { key: 'name', label: 'Name' },
  { key: 'specialty', label: 'Specialty' },
  { key: 'institution', label: 'Institution' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'npi', label: 'NPI' },
  { key: 'fax', label: 'Fax' },
  { key: 'address', label: 'Address' },
  { key: 'status', label: 'Status' },
];

const formFields = [
  { key: 'physician_id', label: 'Physician ID', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'specialty', label: 'Specialty', type: 'text', required: true },
  { key: 'institution', label: 'Institution', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'npi', label: 'NPI', type: 'text', required: true },
  { key: 'fax', label: 'Fax', type: 'text' },
  { key: 'address', label: 'Address', type: 'textarea' },
  { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'], required: true },
];

function ReferringPhysicians() {
  const [items, setItems] = useState([]);
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
      const res = await API().get('/api/referring-physicians');
      setItems(Array.isArray(res.data) ? res.data : res.data.physicians || res.data.data || []);
    } catch (err) {
      addToast('Failed to load referring physicians', 'error');
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
        await API().put(`/api/referring-physicians/${editItem.id}`, formData);
        addToast('Physician updated successfully', 'success');
      } else {
        await API().post('/api/referring-physicians', formData);
        addToast('Physician created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save physician', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete physician "${item.name}"?`)) return;
    try {
      await API().delete(`/api/referring-physicians/${item.id}`);
      addToast('Physician deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete physician', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const filtered = items.filter(item => {
    if (filterStatus && item.status !== filterStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.physician_id || '').toLowerCase().includes(q) ||
      (item.specialty || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Referring Physicians</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search physicians..."
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
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Physician
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
                  <th>Physician ID</th>
                  <th>Name</th>
                  <th>Specialty</th>
                  <th>Institution</th>
                  <th>Phone</th>
                  <th>NPI</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">No physicians found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{item.physician_id}</td>
                      <td>{item.name}</td>
                      <td>{item.specialty || '-'}</td>
                      <td>{item.institution || '-'}</td>
                      <td>{item.phone || '-'}</td>
                      <td>{item.npi || '-'}</td>
                      <td>
                        <span className={`status-badge ${item.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                          {item.status}
                        </span>
                      </td>
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
            title="Physician Details"
            onClose={() => setSelectedItem(null)}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {showForm && (
          <FormModal
            item={editItem}
            fields={formFields}
            title={editItem ? 'Edit Physician' : 'New Physician'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default ReferringPhysicians;
