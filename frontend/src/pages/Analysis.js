import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import DetailModal from '../components/DetailModal';
import FormModal from '../components/FormModal';
import AIOutput from '../components/AIOutput';
import { ToastContainer, useToast } from '../components/Toast';

const detailFields = [
  { key: 'id', label: 'ID' },
  { key: 'analysis_id', label: 'Analysis ID' },
  { key: 'image_id', label: 'Image ID' },
  { key: 'analysis_type', label: 'Analysis Type' },
  { key: 'findings', label: 'Findings' },
  { key: 'confidence_score', label: 'Confidence Score' },
  { key: 'ai_model', label: 'AI Model' },
  { key: 'status', label: 'Status' },
  { key: 'reviewed_by', label: 'Reviewed By' },
  { key: 'review_notes', label: 'Review Notes' },
];

const formFields = [
  { key: 'analysis_id', label: 'Analysis ID', type: 'text', required: true },
  { key: 'image_id', label: 'Image ID', type: 'number', required: true },
  { key: 'analysis_type', label: 'Analysis Type', type: 'select', required: true, options: [
    'anomaly_detection', 'pattern_recognition', 'measurement', 'classification', 'segmentation'
  ]},
  { key: 'findings', label: 'Findings', type: 'textarea' },
  { key: 'confidence_score', label: 'Confidence Score', type: 'number' },
  { key: 'ai_model', label: 'AI Model', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: ['pending', 'in_progress', 'completed', 'reviewed'] },
  { key: 'reviewed_by', label: 'Reviewed By (Radiologist ID)', type: 'number' },
  { key: 'review_notes', label: 'Review Notes', type: 'textarea' },
];

function Analysis() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showSimilarSearch, setShowSimilarSearch] = useState(false);
  const [similarFindings, setSimilarFindings] = useState('');
  const [similarModality, setSimilarModality] = useState('');
  const [similarBodyPart, setSimilarBodyPart] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }), []);

  const fetchData = useCallback(async () => {
    try {
      const res = await API().get('/api/analyses');
      setItems(Array.isArray(res.data) ? res.data : res.data.analyses || res.data.data || []);
    } catch (err) {
      addToast('Failed to load analyses', 'error');
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
        await API().put(`/api/analyses/${editItem.id}`, formData);
        addToast('Analysis updated successfully', 'success');
      } else {
        await API().post('/api/analyses', formData);
        addToast('Analysis created successfully', 'success');
      }
      setShowForm(false);
      setEditItem(null);
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save analysis', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete analysis "${item.analysis_id}"?`)) return;
    try {
      await API().delete(`/api/analyses/${item.id}`);
      addToast('Analysis deleted successfully', 'success');
      setSelectedItem(null);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to delete analysis', 'error');
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setSelectedItem(null);
    setShowForm(true);
  };

  const handleRunAnalysis = async () => {
    if (!selectedItem) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await API().post(`/api/analyses/${selectedItem.id}/run`);
      setAiResult(res.data);
      addToast('AI analysis completed', 'success');
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'AI analysis failed', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSearchSimilar = async () => {
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const res = await API().post('/api/analyses/search-similar', {
        findings: similarFindings,
        modality: similarModality,
        body_part: similarBodyPart,
      });
      setSearchResult(res.data);
      addToast('Search completed', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Search failed', 'error');
    } finally {
      setSearchLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const cls = status === 'completed' ? 'badge-success' :
                status === 'in_progress' ? 'badge-warning' :
                status === 'reviewed' ? 'badge-info' : 'badge-neutral';
    return <span className={`badge ${cls}`}>{status || 'pending'}</span>;
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.analysis_id || '').toLowerCase().includes(q) ||
      (item.analysis_type || '').toLowerCase().includes(q) ||
      (item.ai_model || '').toLowerCase().includes(q) ||
      String(item.image_id || '').includes(q)
    );
  });

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        <div className="page-header">
          <h1>AI Image Analysis</h1>
          <div className="page-toolbar">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search analyses..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              className="btn btn-ai"
              onClick={() => setShowSimilarSearch(!showSimilarSearch)}
            >
              {'\uD83D\uDD0D'} Search Similar Studies
            </button>
            <button className="btn btn-success" onClick={() => { setEditItem(null); setShowForm(true); }}>
              + New Analysis
            </button>
          </div>
        </div>

        {showSimilarSearch && (
          <div className="ai-search-form">
            <h3>{'\uD83E\uDDE0'} AI Similar Study Search</h3>
            <div className="ai-search-fields">
              <div className="form-group">
                <label>Findings</label>
                <input
                  type="text"
                  value={similarFindings}
                  onChange={e => setSimilarFindings(e.target.value)}
                  placeholder="Describe findings..."
                />
              </div>
              <div className="form-group">
                <label>Modality</label>
                <select
                  className="filter-select"
                  value={similarModality}
                  onChange={e => setSimilarModality(e.target.value)}
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
                  value={similarBodyPart}
                  onChange={e => setSimilarBodyPart(e.target.value)}
                  placeholder="e.g., Chest"
                />
              </div>
              <button
                className="btn btn-ai"
                onClick={handleSearchSimilar}
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
                  <th>Analysis ID</th>
                  <th>Image ID</th>
                  <th>Type</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="6" className="no-data">No analyses found</td></tr>
                ) : (
                  filtered.map(item => (
                    <tr key={item.id} onClick={() => { setSelectedItem(item); setAiResult(null); }}>
                      <td>{item.analysis_id}</td>
                      <td>{item.image_id}</td>
                      <td>{item.analysis_type}</td>
                      <td>{item.confidence_score !== null && item.confidence_score !== undefined ? `${Math.round(item.confidence_score * 100)}%` : '-'}</td>
                      <td>{getStatusBadge(item.status)}</td>
                      <td>{item.ai_model || '-'}</td>
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
            title="Analysis Details"
            onClose={() => { setSelectedItem(null); setAiResult(null); }}
            onEdit={handleEdit}
            onDelete={handleDelete}
          >
            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <button
                className="btn btn-ai"
                onClick={handleRunAnalysis}
                disabled={aiLoading}
              >
                {'\uD83E\uDDE0'} {aiLoading ? 'Running Analysis...' : 'Run AI Analysis'}
              </button>
            </div>
            {(aiLoading || aiResult) && (
              <AIOutput data={aiResult} type="analysis" isLoading={aiLoading} />
            )}
          </DetailModal>
        )}

        {showForm && (
          <FormModal
            item={editItem}
            fields={formFields}
            title={editItem ? 'Edit Analysis' : 'New Analysis'}
            onClose={() => { setShowForm(false); setEditItem(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
}

export default Analysis;
