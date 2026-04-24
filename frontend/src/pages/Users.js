import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import DetailModal from '../components/DetailModal';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
  { key: 'created_at', label: 'Created At' },
];

function Users() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', role: 'radiologist', password: '' });
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const res = await API().get('/api/users');
      setItems(Array.isArray(res.data) ? res.data : res.data.users || res.data.data || []);
    } catch (err) {
      addToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [API, addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openForm = (item) => {
    if (item) {
      setEditItem(item);
      setFormData({ name: item.name || '', email: item.email || '', role: item.role || 'radiologist', password: '' });
    } else {
      setEditItem(null);
      setFormData({ name: '', email: '', role: 'radiologist', password: '' });
    }
    setSelectedItem(null);
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = { name: formData.name, email: formData.email, role: formData.role };
    if (formData.password) payload.password = formData.password;

    try {
      if (editItem) {
        await API().put(`/api/users/${editItem.id}`, payload);
        addToast('User updated successfully', 'success');
      } else {
        if (!formData.password) {
          addToast('Password is required for new users', 'error');
          return;
        }
        await API().post('/api/users', payload);
        addToast('User created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save user', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete user "${item.name}"?`)) return;
    try {
      await API().delete(`/api/users/${item.id}`);
      addToast('User deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete user', 'error');
    }
  };

  const handleEdit = (item) => {
    openForm(item);
  };

  const filtered = items.filter(item => {
    if (filterRole && item.role !== filterRole) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>User Management</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="radiologist">Radiologist</option>
            </select>
            <button className="btn btn-success" onClick={() => openForm(null)}>
              + New User
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
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="5" className="no-data">No users found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{item.id}</td>
                      <td>{item.name}</td>
                      <td>{item.email}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#fff',
                          backgroundColor: item.role === 'admin' ? '#6f42c1' : '#007bff'
                        }}>
                          {item.role}
                        </span>
                      </td>
                      <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
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
            title="User Details"
            onClose={() => setSelectedItem(null)}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {showForm && (
          <div className="modal-overlay" onClick={() => { setShowForm(false); setEditItem(null); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editItem ? 'Edit User' : 'New User'}</h2>
                <button className="modal-close" onClick={() => { setShowForm(false); setEditItem(null); }}>&times;</button>
              </div>
              <form onSubmit={handleSave}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input
                      type="email"
                      className="form-control"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Role *</label>
                    <select
                      className="form-control"
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value })}
                      required
                    >
                      <option value="admin">Admin</option>
                      <option value="radiologist">Radiologist</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Password {editItem ? '(leave blank to keep current)' : '*'}</label>
                    <input
                      type="password"
                      className="form-control"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      required={!editItem}
                      placeholder={editItem ? 'Leave blank to keep current password' : ''}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Users;
