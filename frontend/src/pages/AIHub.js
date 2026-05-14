import React, { useState, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import AIOutput from '../components/AIOutput';
import { ToastContainer, useToast } from '../components/Toast';

// All 7 new audit AI features wired into one hub page.
const TOOLS = [
  {
    id: 'report-templating',
    name: 'Report Templating',
    icon: '\uD83D\uDCDD',
    desc: 'Auto-populate report sections based on image type/findings. Suggests ICD-10 / CPT codes.',
    endpoint: '/api/ai-analysis/report-templating',
  },
  {
    id: 'prior-study-comparison',
    name: 'Prior Study Comparison',
    icon: '\uD83D\uDD0D',
    desc: 'Align current study against priors and highlight interval changes.',
    endpoint: '/api/ai-analysis/prior-study-comparison',
  },
  {
    id: 'turnaround-predictor',
    name: 'Turnaround Predictor',
    icon: '\u23F1',
    desc: 'Predict report completion time and recommend callback windows.',
    endpoint: '/api/ai-analysis/turnaround-predictor',
  },
  {
    id: 'incidental-findings',
    name: 'Incidental Findings',
    icon: '\u26A0',
    desc: 'Extract incidental (non-primary) findings and recommended follow-ups.',
    endpoint: '/api/ai-analysis/incidental-findings',
  },
  {
    id: 'qa-audit',
    name: 'QA Audit (A vs B)',
    icon: '\u2696',
    desc: 'Compare two radiologist reports on the same case for concordance.',
    endpoint: '/api/ai-analysis/qa-audit',
  },
  {
    id: 'insurance-preauth',
    name: 'Insurance Pre-Auth',
    icon: '\uD83C\uDFE6',
    desc: 'Apply payer rules and recommend approve / deny / more info.',
    endpoint: '/api/ai-analysis/insurance-preauth',
  },
  {
    id: 'patient-portal-summary',
    name: 'Patient Portal Summary',
    icon: '\uD83D\uDC8C',
    desc: 'Translate a radiology report into plain-language patient summary.',
    endpoint: '/api/ai-analysis/patient-portal-summary',
  },
];

const fieldsByTool = {
  'report-templating': [
    { key: 'modality', label: 'Modality', type: 'select', options: ['CT', 'MRI', 'X-Ray', 'Ultrasound', 'PET', 'Mammography'] },
    { key: 'body_part', label: 'Body Part', type: 'text' },
    { key: 'findings', label: 'Findings (free text)', type: 'textarea', required: true },
    { key: 'specialty', label: 'Specialty Template', type: 'select', options: ['general', 'chest', 'abdomen', 'neuro', 'musculoskeletal', 'pediatric'] },
  ],
  'prior-study-comparison': [
    { key: 'patient_id', label: 'Patient ID (loads priors from DB)', type: 'number' },
    { key: 'modality', label: 'Modality', type: 'text' },
    { key: 'body_part', label: 'Body Part', type: 'text' },
    { key: 'current_findings', label: 'Current Findings', type: 'textarea', required: true },
  ],
  'turnaround-predictor': [
    { key: 'modality', label: 'Modality', type: 'text' },
    { key: 'complexity', label: 'Complexity (1-5)', type: 'number' },
    { key: 'queue_length', label: 'Current queue length', type: 'number' },
  ],
  'incidental-findings': [
    { key: 'primary_indication', label: 'Primary indication', type: 'text' },
    { key: 'patient_id', label: 'Patient ID', type: 'number' },
    { key: 'findings_text', label: 'Full findings text', type: 'textarea', required: true },
  ],
  'qa-audit': [
    { key: 'image_summary', label: 'Image / case summary', type: 'text' },
    { key: 'image_id', label: 'Image ID', type: 'number' },
    { key: 'report_a', label: 'Report A (Radiologist 1)', type: 'textarea', required: true },
    { key: 'report_b', label: 'Report B (Radiologist 2)', type: 'textarea', required: true },
  ],
  'insurance-preauth': [
    { key: 'procedure_code', label: 'CPT / Procedure code', type: 'text', required: true },
    { key: 'diagnosis', label: 'Diagnosis (ICD-10 + clinical)', type: 'text' },
    { key: 'payer', label: 'Payer / insurance', type: 'text' },
    { key: 'patient_id', label: 'Patient ID', type: 'number' },
    { key: 'patient_history', label: 'Relevant patient history', type: 'textarea' },
  ],
  'patient-portal-summary': [
    { key: 'reading_level', label: 'Reading level', type: 'select', options: ['grade 5', 'grade 7', 'grade 9', 'high school'] },
    { key: 'patient_id', label: 'Patient ID', type: 'number' },
    { key: 'report_text', label: 'Full report text', type: 'textarea', required: true },
  ],
};

function AIHub() {
  const [active, setActive] = useState(null);
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  const API = useCallback(() => axios.create({
    baseURL: 'http://localhost:3001',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  }), []);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const selectTool = (id) => {
    setActive(id);
    setForm({});
    setResult(null);
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!active) return;
    const tool = TOOLS.find((t) => t.id === active);
    setLoading(true);
    setResult(null);
    try {
      // Coerce numeric inputs.
      const payload = { ...form };
      ['patient_id', 'image_id', 'complexity', 'queue_length'].forEach((k) => {
        if (payload[k] != null && payload[k] !== '') payload[k] = Number(payload[k]);
      });
      const res = await API().post(tool.endpoint, payload);
      setResult(res.data);
      addToast(`${tool.name} completed`, 'success');
    } catch (err) {
      addToast(err.response?.data?.error || `${tool.name} failed`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const tool = TOOLS.find((t) => t.id === active);
  const fields = active ? fieldsByTool[active] || [] : [];

  return (
    <div className="page-layout">
      <Sidebar />
      <div className="page-content">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="page-header">
          <h1>AI Hub</h1>
          <p style={{ color: '#888', marginTop: 4 }}>
            Specialized AI tools for radiology workflow, QA, and patient communication.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}>
          {TOOLS.map((t) => (
            <div key={t.id}
              onClick={() => selectTool(t.id)}
              style={{
                cursor: 'pointer',
                padding: 18,
                borderRadius: 10,
                border: active === t.id ? '2px solid #4a90e2' : '1px solid #333',
                background: active === t.id ? '#1a2540' : '#161825',
                transition: 'all 0.15s ease',
              }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
              <h3 style={{ margin: '4px 0 6px', fontSize: 15 }}>{t.name}</h3>
              <p style={{ color: '#9aa0b0', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{t.desc}</p>
            </div>
          ))}
        </div>

        {tool && (
          <div style={{
            padding: 24, borderRadius: 10, border: '1px solid #333', background: '#161825',
            marginBottom: 24,
          }}>
            <h2 style={{ marginTop: 0 }}>{tool.icon} {tool.name}</h2>
            <p style={{ color: '#9aa0b0', marginTop: -8 }}>{tool.desc}</p>
            <form onSubmit={submit}>
              {fields.map((f) => (
                <div className="form-group" key={f.key} style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 4, color: '#bbb', fontSize: 13 }}>
                    {f.label}{f.required ? ' *' : ''}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea rows={f.key === 'findings' || f.key === 'current_findings' || f.key === 'findings_text' || f.key === 'report_a' || f.key === 'report_b' || f.key === 'report_text' ? 6 : 3}
                      style={inputStyle}
                      value={form[f.key] || ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      required={!!f.required} />
                  ) : f.type === 'select' ? (
                    <select style={inputStyle}
                      value={form[f.key] || ''}
                      onChange={(e) => setField(f.key, e.target.value)}>
                      <option value="">Select...</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type || 'text'} style={inputStyle}
                      value={form[f.key] || ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      required={!!f.required} />
                  )}
                </div>
              ))}
              <button type="submit" className="btn btn-ai" disabled={loading}>
                {loading ? 'Running...' : `Run ${tool.name}`}
              </button>
            </form>
          </div>
        )}

        {(loading || result) && (
          <AIOutput data={result?.result || result} type="report" isLoading={loading} />
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#1a1d2e',
  border: '1px solid #2a2d3a',
  color: '#e4e6f0',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export default AIHub;
