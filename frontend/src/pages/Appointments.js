import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import FormModal from '../components/FormModal';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'appointment_id', label: 'Appointment ID' },
  { key: 'patient_id', label: 'Patient ID' },
  { key: 'patient_name', label: 'Patient Name' },
  { key: 'radiologist_id', label: 'Radiologist ID' },
  { key: 'radiologist_name', label: 'Radiologist Name' },
  { key: 'modality', label: 'Modality' },
  { key: 'body_part', label: 'Body Part' },
  { key: 'scheduled_date', label: 'Scheduled Date' },
  { key: 'scheduled_time', label: 'Scheduled Time' },
  { key: 'duration_minutes', label: 'Duration (min)' },
  { key: 'room', label: 'Room' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'reason', label: 'Reason' },
  { key: 'notes', label: 'Notes' },
];

const formFields = [
  { key: 'appointment_id', label: 'Appointment ID', type: 'text', required: true },
  { key: 'patient_id', label: 'Patient ID', type: 'number', required: true },
  { key: 'radiologist_id', label: 'Radiologist ID', type: 'number', required: true },
  { key: 'modality', label: 'Modality', type: 'select', options: ['CT', 'MRI', 'X-Ray', 'Ultrasound', 'PET', 'Mammography', 'Fluoroscopy'], required: true },
  { key: 'body_part', label: 'Body Part', type: 'text', required: true },
  { key: 'scheduled_date', label: 'Scheduled Date', type: 'date', required: true },
  { key: 'scheduled_time', label: 'Scheduled Time', type: 'time', required: true },
  { key: 'duration_minutes', label: 'Duration (min)', type: 'number' },
  { key: 'room', label: 'Room', type: 'text' },
  { key: 'priority', label: 'Priority', type: 'select', options: ['stat', 'urgent', 'routine'], required: true },
  { key: 'status', label: 'Status', type: 'select', options: ['scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'], required: true },
  { key: 'reason', label: 'Reason', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

const statusColors = {
  completed: '#28a745',
  scheduled: '#007bff',
  checked_in: '#ffc107',
  in_progress: '#fd7e14',
  cancelled: '#dc3545',
  no_show: '#6c757d',
};

const priorityColors = {
  stat: '#dc3545',
  urgent: '#fd7e14',
  routine: '#28a745',
};

function Appointments() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
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
      const res = await API().get('/api/appointments');
      setItems(Array.isArray(res.data) ? res.data : res.data.appointments || res.data.data || []);
    } catch (err) {
      addToast('Failed to load appointments', 'error');
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
        await API().put(`/api/appointments/${editItem.id}`, formData);
        addToast('Appointment updated successfully', 'success');
      } else {
        await API().post('/api/appointments', formData);
        addToast('Appointment created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save appointment', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete appointment "${item.appointment_id}"?`)) return;
    try {
      await API().delete(`/api/appointments/${item.id}`);
      addToast('Appointment deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete appointment', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const handleStatusChange = async (item, newStatus) => {
    try {
      await API().put(`/api/appointments/${item.id}`, { ...item, status: newStatus });
      addToast(`Appointment ${newStatus.replace('_', ' ')} successfully`, 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update status', 'error');
    }
  };

  const filtered = items.filter(item => {
    if (filterStatus && item.status !== filterStatus) return false;
    if (filterPriority && item.priority !== filterPriority) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.appointment_id || '').toLowerCase().includes(q) ||
      (item.room || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Appointment Management</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search by ID or room..."
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
              <option value="scheduled">Scheduled</option>
              <option value="checked_in">Checked In</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>
            <select
              className="filter-select"
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="stat">Stat</option>
              <option value="urgent">Urgent</option>
              <option value="routine">Routine</option>
            </select>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Appointment
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
                  <th>Appt ID</th>
                  <th>Patient</th>
                  <th>Radiologist</th>
                  <th>Modality</th>
                  <th>Body Part</th>
                  <th>Scheduled Date</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="8" className="no-data">No appointments found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{item.appointment_id}</td>
                      <td>{item.patient_name || item.patient_id}</td>
                      <td>{item.radiologist_name || item.radiologist_id}</td>
                      <td>{item.modality}</td>
                      <td>{item.body_part || '-'}</td>
                      <td>{item.scheduled_date}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#fff',
                          backgroundColor: priorityColors[item.priority] || '#6c757d'
                        }}>
                          {item.priority}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#fff',
                          backgroundColor: statusColors[item.status] || '#6c757d'
                        }}>
                          {(item.status || '').replace('_', ' ')}
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
          <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Appointment Details</h2>
                <button className="modal-close" onClick={() => setSelectedItem(null)}>&times;</button>
              </div>
              <div className="modal-body">
                {detailFields.map(f => (
                  <div key={f.key} className="detail-row">
                    <span className="detail-label">{f.label}:</span>
                    <span className="detail-value">
                      {f.key === 'status' ? (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#fff',
                          backgroundColor: statusColors[selectedItem.status] || '#6c757d'
                        }}>
                          {(selectedItem.status || '').replace('_', ' ')}
                        </span>
                      ) : (
                        String(selectedItem[f.key] ?? '-')
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedItem.status === 'scheduled' && (
                  <button className="btn" style={{ backgroundColor: '#ffc107', color: '#000' }}
                    onClick={() => handleStatusChange(selectedItem, 'checked_in')}>
                    Check In
                  </button>
                )}
                {(selectedItem.status === 'scheduled' || selectedItem.status === 'checked_in') && (
                  <button className="btn" style={{ backgroundColor: '#fd7e14', color: '#fff' }}
                    onClick={() => handleStatusChange(selectedItem, 'in_progress')}>
                    Start
                  </button>
                )}
                {(selectedItem.status === 'in_progress' || selectedItem.status === 'checked_in') && (
                  <button className="btn btn-success"
                    onClick={() => handleStatusChange(selectedItem, 'completed')}>
                    Complete
                  </button>
                )}
                {selectedItem.status !== 'cancelled' && selectedItem.status !== 'completed' && (
                  <button className="btn btn-danger"
                    onClick={() => handleStatusChange(selectedItem, 'cancelled')}>
                    Cancel
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
            title={editItem ? 'Edit Appointment' : 'New Appointment'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default Appointments;
