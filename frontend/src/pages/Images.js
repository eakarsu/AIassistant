import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import DetailModal from '../components/DetailModal';
import FormModal from '../components/FormModal';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'image_id', label: 'Image ID' },
  { key: 'patient_id', label: 'Patient ID' },
  { key: 'modality', label: 'Modality' },
  { key: 'body_part', label: 'Body Part' },
  { key: 'description', label: 'Description' },
  { key: 'acquisition_date', label: 'Acquisition Date' },
  { key: 'pacs_location', label: 'PACS Location' },
  { key: 'file_size', label: 'File Size' },
  { key: 'referring_physician', label: 'Referring Physician' },
  { key: 'clinical_indication', label: 'Clinical Indication' },
  { key: 'status', label: 'Status' },
  { key: 'is_de_identified', label: 'De-identified' },
];

const formFields = [
  { key: 'image_id', label: 'Image ID', type: 'text', required: true },
  { key: 'patient_id', label: 'Patient ID', type: 'number', required: true },
  { key: 'modality', label: 'Modality', type: 'select', required: true, options: ['CT', 'MRI', 'X-Ray', 'Ultrasound', 'PET'] },
  { key: 'body_part', label: 'Body Part', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'acquisition_date', label: 'Acquisition Date', type: 'datetime-local' },
  { key: 'pacs_location', label: 'PACS Location', type: 'text' },
  { key: 'file_size', label: 'File Size', type: 'text' },
  { key: 'referring_physician', label: 'Referring Physician', type: 'text' },
  { key: 'clinical_indication', label: 'Clinical Indication', type: 'textarea' },
  { key: 'status', label: 'Status', type: 'select', options: ['pending', 'processing', 'stored', 'archived'] },
];

function Images() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [modalityFilter, setModalityFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deIdentifying, setDeIdentifying] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const res = await API().get('/api/images');
      setItems(Array.isArray(res.data) ? res.data : res.data.images || res.data.data || []);
    } catch (err) {
      addToast('Failed to load images', 'error');
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
        await API().put(`/api/images/${editItem.id}`, formData);
        addToast('Image updated successfully', 'success');
      } else {
        await API().post('/api/images', formData);
        addToast('Image created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save image', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete image "${item.image_id}"?`)) return;
    try {
      await API().delete(`/api/images/${item.id}`);
      addToast('Image deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete image', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const handleDeIdentify = async () => {
    if (!selectedItem) return;
    setDeIdentifying(true);
    try {
      await API().post(`/api/images/${selectedItem.id}/de-identify`);
      addToast('Image de-identified successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to de-identify image', 'error');
    } finally {
      setDeIdentifying(false);
    }
  };

  const filtered = items.filter(item => {
    const matchesSearch = !search ||
      (item.image_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.body_part || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.modality || '').toLowerCase().includes(search.toLowerCase());
    const matchesModality = modalityFilter === 'All' || item.modality === modalityFilter;
    return matchesSearch && matchesModality;
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Radiology Images</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search images..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={modalityFilter}
              onChange={e => setModalityFilter(e.target.value)}
            >
              <option value="All">All Modalities</option>
              <option value="CT">CT</option>
              <option value="MRI">MRI</option>
              <option value="X-Ray">X-Ray</option>
              <option value="Ultrasound">Ultrasound</option>
              <option value="PET">PET</option>
            </select>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Image
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
                  <th>Image ID</th>
                  <th>Patient</th>
                  <th>Modality</th>
                  <th>Body Part</th>
                  <th>Acquisition Date</th>
                  <th>Status</th>
                  <th>De-identified</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">No images found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{item.image_id}</td>
                      <td>{item.patient_id}</td>
                      <td><span className="badge badge-info">{item.modality}</span></td>
                      <td>{item.body_part}</td>
                      <td>{item.acquisition_date ? new Date(item.acquisition_date).toLocaleDateString() : '-'}</td>
                      <td>
                        <span className={`badge ${
                          item.status === 'stored' ? 'badge-success' :
                          item.status === 'processing' ? 'badge-warning' :
                          item.status === 'archived' ? 'badge-neutral' : 'badge-info'
                        }`}>{item.status || 'pending'}</span>
                      </td>
                      <td>
                        {item.is_de_identified ?
                          <span className="check-yes">{'\u2714'}</span> :
                          <span className="check-no">{'\u2718'}</span>
                        }
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
            title="Image Details"
            onClose={() => setSelectedItem(null)}
            onEdit={handleEdit}
            onDelete={handleDelete}
          >
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-ai"
                onClick={handleDeIdentify}
                disabled={deIdentifying || selectedItem.is_de_identified}
              >
                {deIdentifying ? 'De-identifying...' : selectedItem.is_de_identified ? 'Already De-identified' : 'De-identify Image'}
              </button>
            </div>
          </DetailModal>
        )}

        {showForm && (
          <FormModal
            item={editItem}
            fields={formFields}
            title={editItem ? 'Edit Image' : 'New Image'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default Images;
