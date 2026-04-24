import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import DetailModal from '../components/DetailModal';
import FormModal from '../components/FormModal';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'patient_id', label: 'Patient ID' },
  { key: 'name', label: 'Name' },
  { key: 'date_of_birth', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'medical_record_number', label: 'MRN' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'insurance_provider', label: 'Insurance Provider' },
  { key: 'insurance_id', label: 'Insurance ID' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'medical_history', label: 'Medical History' },
];

const formFields = [
  { key: 'patient_id', label: 'Patient ID', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'date_of_birth', label: 'Date of Birth', type: 'date', required: true },
  { key: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], required: true },
  { key: 'medical_record_number', label: 'MRN', type: 'text', required: true },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address', label: 'Address', type: 'textarea' },
  { key: 'insurance_provider', label: 'Insurance Provider', type: 'text' },
  { key: 'insurance_id', label: 'Insurance ID', type: 'text' },
  { key: 'allergies', label: 'Allergies', type: 'textarea' },
  { key: 'medical_history', label: 'Medical History', type: 'textarea' },
];

function Patients() {
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
      const res = await API().get('/api/patients');
      setItems(Array.isArray(res.data) ? res.data : res.data.patients || res.data.data || []);
    } catch (err) {
      addToast('Failed to load patients', 'error');
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
        await API().put(`/api/patients/${editItem.id}`, formData);
        addToast('Patient updated successfully', 'success');
      } else {
        await API().post('/api/patients', formData);
        addToast('Patient created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save patient', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete patient "${item.name}"?`)) return;
    try {
      await API().delete(`/api/patients/${item.id}`);
      addToast('Patient deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete patient', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.patient_id || '').toLowerCase().includes(q) ||
      (item.medical_record_number || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Patient Management</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search patients..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Patient
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
                  <th>Patient ID</th>
                  <th>Name</th>
                  <th>DOB</th>
                  <th>Gender</th>
                  <th>MRN</th>
                  <th>Phone</th>
                  <th>Insurance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">No patients found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{item.patient_id}</td>
                      <td>{item.name}</td>
                      <td>{item.date_of_birth}</td>
                      <td>{item.gender}</td>
                      <td>{item.medical_record_number}</td>
                      <td>{item.phone || '-'}</td>
                      <td>{item.insurance_provider || '-'}</td>
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
            title="Patient Details"
            onClose={() => setSelectedItem(null)}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {showForm && (
          <FormModal
            item={editItem}
            fields={formFields}
            title={editItem ? 'Edit Patient' : 'New Patient'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default Patients;
