import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:3001';
const blank = { name: '', description: '', body: '', tags: '' };

function extractVars(body) {
  const out = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(body || ''))) !== null) out.add(m[1]);
  return Array.from(out);
}

export default function PromptTemplateEditor() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ ...blank });
  const [editingId, setEditingId] = useState(null);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${API_BASE}/api/custom-views/prompt-templates`);
      setItems(r.data?.templates || []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setEditingId(null); setForm({ ...blank }); setStatus(null); };

  const startEdit = (tpl) => {
    setEditingId(tpl.id);
    setForm({
      name: tpl.name || '',
      description: tpl.description || '',
      body: tpl.body || '',
      tags: tpl.tags || '',
    });
    setStatus(null);
  };

  const save = async () => {
    setError(null);
    setStatus(null);
    if (!form.name.trim() || !form.body.trim()) {
      setError('Name and body are required.');
      return;
    }
    try {
      if (editingId) {
        await axios.put(`${API_BASE}/api/custom-views/prompt-templates/${editingId}`, form);
        setStatus(`Updated template #${editingId}.`);
      } else {
        const r = await axios.post(`${API_BASE}/api/custom-views/prompt-templates`, form);
        setStatus(`Created template #${r.data?.id}.`);
      }
      reset();
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to save template');
    }
  };

  const remove = async (id) => {
    setError(null);
    setStatus(null);
    try {
      await axios.delete(`${API_BASE}/api/custom-views/prompt-templates/${id}`);
      setStatus(`Deleted template #${id}.`);
      if (editingId === id) reset();
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to delete template');
    }
  };

  const detectedVars = useMemo(() => extractVars(form.body), [form.body]);

  return (
    <div data-testid="prompt-template-editor-card" style={card}>
      <div style={headerRow}>
        <div>
          <h3 style={h3}>Prompt Template Editor</h3>
          <p style={subtle}>{items.length} templates · variables detected from <code>{'{{name}}'}</code> placeholders.</p>
        </div>
        <button onClick={load} disabled={loading} style={btn}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {status && <div style={okBox}>{status}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Templates</div>
          <div style={{ border: '1px solid #1e293b', borderRadius: 8, maxHeight: 360, overflowY: 'auto', background: '#0b1220' }}>
            {items.map((t) => (
              <div key={t.id} style={{ padding: 10, borderBottom: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{t.name}</div>
                    <div style={{ color: '#64748b', fontSize: 11 }}>{t.description || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(t)} style={btn}>Edit</button>
                    <button onClick={() => remove(t.id)} style={btnDanger}>Del</button>
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                  vars: {(t.variables || []).map((v) => <span key={v} style={pill}>{v}</span>)}
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                  tags: {String(t.tags || '').split(',').filter(Boolean).map((s) => (
                    <span key={s} style={tagPill}>{s.trim()}</span>
                  ))}
                </div>
              </div>
            ))}
            {!items.length && !loading && <div style={{ padding: 12, color: '#64748b' }}>No templates yet.</div>}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{editingId ? `Editing #${editingId}` : 'New template'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="name (e.g. concise-summary)" style={input} />
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="short description" style={input} />
            <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="tags (comma-separated)" style={input} />
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder={'body (use {{variable}} placeholders)'}
              rows={10}
              style={{ ...input, fontFamily: 'ui-monospace, Menlo, monospace' }}
            />
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              detected vars: {detectedVars.length ? detectedVars.map((v) => <span key={v} style={pill}>{v}</span>) : <span style={{ color: '#64748b' }}>none</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} style={btnPrimary}>{editingId ? 'Update' : 'Create'}</button>
              {editingId && <button onClick={reset} style={btn}>Cancel</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const card = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 10, padding: 14 };
const headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 };
const h3 = { margin: 0, color: '#e2e8f0' };
const subtle = { margin: '4px 0 0', color: '#94a3b8', fontSize: 12 };
const input = { padding: '6px 8px', background: '#0b1220', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6 };
const btn = { padding: '4px 8px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#0ea5e9', color: '#0b1220', border: '1px solid #0ea5e9' };
const btnDanger = { ...btn, background: '#7f1d1d', color: '#fecaca', border: '1px solid #991b1b' };
const errorBox = { color: '#fecaca', background: '#7f1d1d', padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 12 };
const okBox = { color: '#bbf7d0', background: '#14532d', padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 12 };
const pill = { padding: '1px 6px', background: '#1e293b', color: '#a3e635', borderRadius: 999, fontSize: 10, border: '1px solid #334155', marginRight: 4 };
const tagPill = { padding: '1px 6px', background: '#1e293b', color: '#7dd3fc', borderRadius: 4, fontSize: 10, border: '1px solid #334155', marginRight: 4 };
