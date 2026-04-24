import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import DetailModal from '../components/DetailModal';
import FormModal from '../components/FormModal';
import AIOutput from '../components/AIOutput';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'study_id', label: 'Study ID' },
  { key: 'patient_id', label: 'Patient ID' },
  { key: 'modality', label: 'Modality' },
  { key: 'body_part', label: 'Body Part' },
  { key: 'study_date', label: 'Study Date' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'findings', label: 'Findings' },
  { key: 'radiologist_name', label: 'Radiologist' },
  { key: 'institution', label: 'Institution' },
  { key: 'similarity_tags', label: 'Similarity Tags' },
  { key: 'study_notes', label: 'Study Notes' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'follow_up_required', label: 'Follow-up Required' },
];

const formFields = [
  { key: 'study_id', label: 'Study ID', type: 'text', required: true },
  { key: 'patient_id', label: 'Patient ID', type: 'number', required: true },
  { key: 'modality', label: 'Modality', type: 'select', required: true, options: ['CT', 'MRI', 'X-Ray', 'Ultrasound', 'PET'] },
  { key: 'body_part', label: 'Body Part', type: 'text', required: true },
  { key: 'study_date', label: 'Study Date', type: 'date' },
  { key: 'diagnosis', label: 'Diagnosis', type: 'textarea' },
  { key: 'findings', label: 'Findings', type: 'textarea' },
  { key: 'radiologist_name', label: 'Radiologist Name', type: 'text' },
  { key: 'institution', label: 'Institution', type: 'text' },
  { key: 'similarity_tags', label: 'Similarity Tags (comma separated)', type: 'text' },
  { key: 'study_notes', label: 'Study Notes', type: 'textarea' },
  { key: 'outcome', label: 'Outcome', type: 'text' },
  { key: 'follow_up_required', label: 'Follow-up Required', type: 'select', options: ['true', 'false'] },
];

function Studies() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [modalityFilter, setModalityFilter] = useState('All');
  const [bodyPartFilter, setBodyPartFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showAiSearch, setShowAiSearch] = useState(false);
  const [aiFindings, setAiFindings] = useState('');
  const [aiModality, setAiModality] = useState('');
  const [aiBodyPart, setAiBodyPart] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const res = await API().get('/api/studies');
      setItems(Array.isArray(res.data) ? res.data : res.data.studies || res.data.data || []);
    } catch (err) {
      addToast('Failed to load studies', 'error');
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
        await API().put(`/api/studies/${editItem.id}`, formData);
        addToast('Study updated successfully', 'success');
      } else {
        await API().post('/api/studies', formData);
        addToast('Study created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save study', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete study "${item.study_id}"?`)) return;
    try {
      await API().delete(`/api/studies/${item.id}`);
      addToast('Study deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete study', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const handleAiSearch = async () => {
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const res = await API().post('/api/analyses/search-similar', {
        findings: aiFindings,
        modality: aiModality,
        body_part: aiBodyPart,
      });
      setSearchResult(res.data);
      addToast('AI search completed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'AI search failed', 'error');
    } finally {
      setSearchLoading(false);
    }
  };

  const filtered = items.filter(item => {
    const matchesSearch = !search ||
      (item.study_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.diagnosis || '').toLowerCase().includes(search.toLowerCase()) ||
      (item.body_part || '').toLowerCase().includes(search.toLowerCase()) ||
      String(item.patient_id || '').includes(search);
    const matchesModality = modalityFilter === 'All' || item.modality === modalityFilter;
    const matchesBodyPart = !bodyPartFilter || (item.body_part || '').toLowerCase().includes(bodyPartFilter.toLowerCase());
    return matchesSearch && matchesModality && matchesBodyPart;
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>Prior Studies Search</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search studies..."
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
            <input
              type="text"
              className="filter-select"
              placeholder="Body part..."
              value={bodyPartFilter}
              onChange={e => setBodyPartFilter(e.target.value)}
              style={{ width: 140 }}
            />
            <button
              className="btn btn-ai"
              onClick={() => setShowAiSearch(!showAiSearch)}
            >
              {'\uD83E\uDDE0'} AI Search
            </button>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Study
            </button>
          </div>
        </div>

        {showAiSearch && (
          <div className="ai-search-form">
            <h3>{'\uD83E\uDDE0'} AI Similar Study Search</h3>
            <div className="ai-search-fields">
              <div className="form-group">
                <label>Findings</label>
                <input
                  type="text"
                  value={aiFindings}
                  onChange={e => setAiFindings(e.target.value)}
                  placeholder="Describe findings..."
                />
              </div>
              <div className="form-group">
                <label>Modality</label>
                <select
                  className="filter-select"
                  value={aiModality}
                  onChange={e => setAiModality(e.target.value)}
                >
                  <option value="">Any</option>
                  <option value="CT">CT</option>
                  <option value="MRI">MRI</option>
                  <option value="X-Ray">X-Ray</option>
                  <option value="Ultrasound">Ultrasound</option>
                  <option value="PET">PET</option>
                </select>
              </div>
              <div className="form-group">
                <label>Body Part</label>
                <input
                  type="text"
                  value={aiBodyPart}
                  onChange={e => setAiBodyPart(e.target.value)}
                  placeholder="e.g., Chest"
                />
              </div>
              <button
                className="btn btn-ai"
                onClick={handleAiSearch}
                disabled={searchLoading}
              >
                {searchLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
            {(searchLoading || searchResult) && (
              <AIOutput data={searchResult} type="search" isLoading={searchLoading} />
            )}
          </div>
        )}

        {loading ? (
          <div className="loading-container"><div className="loading-spinner"></div></div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Study ID</th>
                  <th>Patient</th>
                  <th>Modality</th>
                  <th>Body Part</th>
                  <th>Study Date</th>
                  <th>Diagnosis</th>
                  <th>Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" className="no-data">No studies found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)}>
                      <td>{item.study_id}</td>
                      <td>{item.patient_id}</td>
                      <td><span className="badge badge-info">{item.modality}</span></td>
                      <td>{item.body_part}</td>
                      <td>{item.study_date || '-'}</td>
                      <td>{item.diagnosis || '-'}</td>
                      <td>
                        {String(item.follow_up_required) === 'true' ?
                          <span className="badge badge-warning">Yes</span> :
                          <span className="badge badge-neutral">No</span>
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
            title="Study Details"
            onClose={() => setSelectedItem(null)}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}

        {showForm && (
          <FormModal
            item={editItem}
            fields={formFields}
            title={editItem ? 'Edit Study' : 'New Study'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default Studies;
