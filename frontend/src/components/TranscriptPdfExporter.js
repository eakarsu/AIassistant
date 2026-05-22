import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:3001';

export default function TranscriptPdfExporter() {
  const [convs, setConvs] = useState([]);
  const [convId, setConvId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastUrl, setLastUrl] = useState(null);

  const loadList = useCallback(async () => {
    try {
      const r = await axios.get(`${API_BASE}/api/custom-views/conversation-timeline`, { params: { limit: 24 } });
      const lanes = (r.data && r.data.lanes) || [];
      setConvs(lanes);
      if (lanes.length && !convId) setConvId(String(lanes[0].id));
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load conversations');
    }
  }, [convId]);

  useEffect(() => { loadList(); }, [loadList]);

  const download = async () => {
    if (!convId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await axios.get(`${API_BASE}/api/custom-views/transcript-pdf`, {
        params: { conv_id: convId },
        responseType: 'blob',
      });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setLastUrl(url);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conversation-${convId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to export PDF');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (!convId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await axios.get(`${API_BASE}/api/custom-views/transcript-pdf`, {
        params: { conv_id: convId },
        responseType: 'blob',
      });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setLastUrl(url);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load PDF');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="transcript-pdf-card" style={card}>
      <h3 style={h3}>Transcript PDF</h3>
      <p style={subtle}>Export any conversation as a styled PDF transcript.</p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <label style={subtle}>Conversation</label>
        <select value={convId} onChange={(e) => setConvId(e.target.value)} style={select}>
          {convs.map((c) => (
            <option key={c.id} value={c.id}>#{c.id} — {c.title}</option>
          ))}
        </select>
        <button onClick={preview} disabled={busy || !convId} style={btn}>{busy ? 'Working…' : 'Preview'}</button>
        <button onClick={download} disabled={busy || !convId} style={btnPrimary}>{busy ? 'Working…' : 'Download PDF'}</button>
      </div>

      <div style={{ background: '#0b1220', border: '1px solid #1e293b', borderRadius: 8, height: 380 }}>
        {lastUrl ? (
          <iframe title="transcript-pdf" src={lastUrl} style={{ width: '100%', height: '100%', border: 0, borderRadius: 8 }} />
        ) : (
          <div style={{ padding: 16, color: '#64748b' }}>
            Pick a conversation and press <b>Preview</b> to render the PDF inline,
            or <b>Download PDF</b> to save it.
          </div>
        )}
      </div>
    </div>
  );
}

const card = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 14 };
const h3 = { margin: 0, color: '#e2e8f0' };
const subtle = { margin: '4px 0 0', color: '#94a3b8', fontSize: 12 };
const btn = { padding: '6px 10px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer' };
const btnPrimary = { ...btn, background: '#0ea5e9', color: '#0b1220', border: '1px solid #0ea5e9' };
const select = { padding: '6px 8px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, minWidth: 280 };
const errorBox = { color: '#fecaca', background: '#7f1d1d', padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 12 };
