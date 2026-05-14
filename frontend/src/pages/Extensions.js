import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';

// Apply pass 5 — Extensions surface (DICOM registry, EHR, Teleradiology).
// Reuses existing CSS classes from App.css. JWT bearer from localStorage.

const tabs = [
  { id: 'dicom', label: 'DICOM Studies' },
  { id: 'tele', label: 'Teleradiology Queue' },
  { id: 'ehr', label: 'EHR Integration' },
];

function authConfig() {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: token ? `Bearer ${token}` : '' } };
}

export default function Extensions() {
  const [tab, setTab] = useState('dicom');
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <div className="page-header">
          <h1>Extensions</h1>
          <p>DICOM registry, teleradiology workflow, and EHR sync (FHIR).</p>
        </div>
        <div className="tab-bar" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'btn btn-primary' : 'btn'}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'dicom' && <DicomPanel />}
        {tab === 'tele' && <TelePanel />}
        {tab === 'ehr' && <EhrPanel />}
      </div>
    </div>
  );
}

function DicomPanel() {
  const [studies, setStudies] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ patient_id: '', study_uid: '', modality: 'CT', body_part: '' });
  const load = useCallback(async () => {
    try {
      const r = await axios.get('/api/dicom-studies', authConfig());
      setStudies(r.data.studies || []);
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await axios.post('/api/dicom-studies', form, authConfig());
      setForm({ patient_id: '', study_uid: '', modality: 'CT', body_part: '' });
      load();
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
  };
  const advisory = async (id) => {
    try {
      const r = await axios.post('/api/dicom-cad-advisory', { dicom_study_id: id }, authConfig());
      alert(JSON.stringify(r.data.advisory, null, 2).slice(0, 1500));
    } catch (e) {
      const status = e?.response?.status;
      const data = e?.response?.data || {};
      if (status === 503) alert(`AI not configured: missing ${data.missing || 'OPENROUTER_API_KEY'}`);
      else alert(data.error || e.message);
    }
  };
  return (
    <div>
      <h3>DICOM Studies</h3>
      {err && <div className="error">{err}</div>}
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="patient_id" value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })} />
        <input placeholder="study_uid (required)" value={form.study_uid} onChange={e => setForm({ ...form, study_uid: e.target.value })} required />
        <select value={form.modality} onChange={e => setForm({ ...form, modality: e.target.value })}>
          {['CT', 'MR', 'CR', 'XA', 'US', 'PT', 'NM', 'DX'].map(m => <option key={m}>{m}</option>)}
        </select>
        <input placeholder="body_part" value={form.body_part} onChange={e => setForm({ ...form, body_part: e.target.value })} />
        <button className="btn btn-primary" type="submit">Register</button>
      </form>
      <table className="table">
        <thead><tr><th>ID</th><th>Patient</th><th>UID</th><th>Modality</th><th>Body</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {studies.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td><td>{s.patient_id || '—'}</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{s.study_uid}</td>
              <td>{s.modality}</td><td>{s.body_part || '—'}</td><td>{new Date(s.created_at).toLocaleString()}</td>
              <td><button className="btn" onClick={() => advisory(s.id)}>CAD Advisory</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TelePanel() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ patient_id: '', modality: 'CT', priority: 'routine', notes: '' });
  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        axios.get('/api/teleradiology/assignments', authConfig()),
        axios.get('/api/teleradiology/queue-stats', authConfig()),
      ]);
      setItems(a.data.assignments || []);
      setStats(s.data.stats || []);
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await axios.post('/api/teleradiology/assignments', form, authConfig());
      setForm({ patient_id: '', modality: 'CT', priority: 'routine', notes: '' });
      load();
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
  };
  const setStatus = async (id, status) => {
    try { await axios.patch(`/api/teleradiology/assignments/${id}`, { status }, authConfig()); load(); }
    catch (e) { setErr(e?.response?.data?.error || e.message); }
  };
  return (
    <div>
      <h3>Teleradiology Queue</h3>
      {err && <div className="error">{err}</div>}
      <div style={{ marginBottom: 12 }}>
        <strong>Stats:</strong> {stats.map((s, i) => <span key={i} style={{ marginRight: 12 }}>{s.priority}/{s.status}: {s.n}</span>)}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="patient_id" value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })} />
        <select value={form.modality} onChange={e => setForm({ ...form, modality: e.target.value })}>
          {['CT', 'MR', 'CR', 'US', 'XA'].map(m => <option key={m}>{m}</option>)}
        </select>
        <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
          <option>stat</option><option>urgent</option><option>routine</option>
        </select>
        <input placeholder="notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        <button className="btn btn-primary" type="submit">Create</button>
      </form>
      <table className="table">
        <thead><tr><th>ID</th><th>Patient</th><th>Modality</th><th>Priority</th><th>Status</th><th>SLA hrs</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {items.map(a => (
            <tr key={a.id}>
              <td>{a.id}</td><td>{a.patient_id || '—'}</td><td>{a.modality || '—'}</td>
              <td>{a.priority}</td><td>{a.status}</td><td>{a.sla_hours}</td>
              <td>{new Date(a.created_at).toLocaleString()}</td>
              <td>
                <select value={a.status} onChange={e => setStatus(a.id, e.target.value)}>
                  {['unassigned', 'assigned', 'in-progress', 'finalized', 'addendum'].map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EhrPanel() {
  const [status, setStatus] = useState(null);
  const [log, setLog] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ patient_id: '', ehr_patient_id: '' });
  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        axios.get('/api/ehr/status', authConfig()),
        axios.get('/api/ehr/sync-log', authConfig()),
      ]);
      setStatus(s.data); setLog(l.data.entries || []);
    } catch (e) { setErr(e?.response?.data?.error || e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const sync = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await axios.post('/api/ehr/patient-sync', form, authConfig());
      load();
    } catch (e) {
      const data = e?.response?.data || {};
      if (e?.response?.status === 503) setErr(`EHR not configured: missing ${data.missing}`);
      else setErr(data.error || e.message);
    }
  };
  return (
    <div>
      <h3>EHR Integration</h3>
      {err && <div className="error">{err}</div>}
      {status && (
        <div style={{ marginBottom: 12 }}>
          <strong>Configured:</strong> {String(status.configured)} {status.missing?.length > 0 && <em>(missing: {status.missing.join(', ')})</em>}
        </div>
      )}
      <form onSubmit={sync} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input placeholder="patient_id" required value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })} />
        <input placeholder="ehr_patient_id (optional)" value={form.ehr_patient_id} onChange={e => setForm({ ...form, ehr_patient_id: e.target.value })} />
        <button className="btn btn-primary" type="submit">Patient Sync</button>
      </form>
      <table className="table">
        <thead><tr><th>ID</th><th>Patient</th><th>Op</th><th>Request</th><th>Response</th><th>Status</th><th>When</th></tr></thead>
        <tbody>
          {log.map(e => (
            <tr key={e.id}>
              <td>{e.id}</td><td>{e.patient_id}</td><td>{e.operation}</td>
              <td style={{ fontSize: 11 }}>{e.request_summary}</td>
              <td style={{ fontSize: 11 }}>{e.response_summary}</td>
              <td>{e.status}</td><td>{new Date(e.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
