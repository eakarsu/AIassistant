import NativeAIControls from "../components/NativeAIControls.jsx";
import AIReport from '../components/AIReport';
import React, { useState, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
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

export const fieldsByTool = {
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

const PRESET_NAMES = ['Acute chest CT', 'Neuro follow-up', 'Routine screening'];
export const TOOL_PRESETS = {
  'report-templating': [
    { modality: 'CT', body_part: 'Chest', findings: 'CTA chest demonstrates a central filling defect in the right lower lobe pulmonary artery. No right-heart strain. Small right pleural effusion.', specialty: 'chest' },
    { modality: 'MRI', body_part: 'Brain', findings: 'Stable periventricular T2/FLAIR hyperintensities without restricted diffusion or new enhancement compared with the prior study.', specialty: 'neuro' },
    { modality: 'Mammography', body_part: 'Bilateral breasts', findings: 'Screening views show scattered fibroglandular density without suspicious mass, distortion, or grouped calcifications.', specialty: 'general' },
  ],
  'prior-study-comparison': [
    { patient_id: 1, modality: 'CT', body_part: 'Chest', current_findings: 'New 6 mm right lower lobe pulmonary nodule; compare size and morphology with all available prior chest CT examinations.' },
    { patient_id: 2, modality: 'MRI', body_part: 'Brain', current_findings: 'Periventricular FLAIR lesions are unchanged. No new enhancement or restricted diffusion.' },
    { patient_id: 3, modality: 'X-Ray', body_part: 'Chest', current_findings: 'No focal air-space opacity. Cardiomediastinal silhouette is stable.' },
  ],
  'turnaround-predictor': [
    { modality: 'CT', complexity: 5, queue_length: 12 },
    { modality: 'MRI', complexity: 4, queue_length: 7 },
    { modality: 'X-Ray', complexity: 2, queue_length: 18 },
  ],
  'incidental-findings': [
    { primary_indication: 'Pulmonary embolism evaluation', patient_id: 1, findings_text: 'No pulmonary embolism. Incidental 6 mm solid right lower lobe pulmonary nodule and a 1.8 cm left thyroid nodule are present.' },
    { primary_indication: 'Headache', patient_id: 2, findings_text: 'No acute intracranial abnormality. Mild mucosal thickening in the maxillary sinuses is incidentally noted.' },
    { primary_indication: 'Screening mammography', patient_id: 3, findings_text: 'No suspicious breast finding. Benign vascular calcifications are present.' },
  ],
  'qa-audit': [
    { image_summary: 'CTA chest for acute dyspnea; right lower lobe segmental embolus without right-heart strain.', image_id: 1, report_a: 'Segmental pulmonary embolus in the right lower lobe. No CT evidence of right-heart strain.', report_b: 'Acute right lower lobe pulmonary embolus. RV/LV ratio is normal. Small right pleural effusion.' },
    { image_summary: 'Brain MRI follow-up for demyelinating disease.', image_id: 2, report_a: 'Stable periventricular lesions. No active enhancement.', report_b: 'Unchanged white-matter lesion burden without enhancing plaque.' },
    { image_summary: 'Routine frontal and lateral chest radiographs.', image_id: 3, report_a: 'No acute cardiopulmonary abnormality.', report_b: 'Clear lungs. Normal cardiomediastinal silhouette.' },
  ],
  'insurance-preauth': [
    { procedure_code: '71275', diagnosis: 'R06.02 shortness of breath; suspected pulmonary embolism', payer: 'Example Health PPO', patient_id: 1, patient_history: 'Acute dyspnea and elevated D-dimer; no iodinated contrast allergy documented.' },
    { procedure_code: '70553', diagnosis: 'G35 multiple sclerosis follow-up', payer: 'Example Regional Plan', patient_id: 2, patient_history: 'Known demyelinating disease with interval neurologic symptoms; prior MRI available.' },
    { procedure_code: '77067', diagnosis: 'Z12.31 screening mammogram', payer: 'Example Medicare Plan', patient_id: 3, patient_history: 'Routine annual screening; no current breast symptoms.' },
  ],
  'patient-portal-summary': [
    { reading_level: 'grade 7', patient_id: 1, report_text: 'CTA chest shows a small blood clot in a right lower lobe pulmonary artery. There is no imaging evidence of strain on the right side of the heart.' },
    { reading_level: 'grade 9', patient_id: 2, report_text: 'Brain MRI findings are stable compared with the prior examination. No new or enhancing demyelinating lesion is identified.' },
    { reading_level: 'grade 5', patient_id: 3, report_text: 'Screening mammogram shows no suspicious mass or calcifications. Continue routine annual screening.' },
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
  const presetChoices = PRESET_NAMES.map((name, index) => ({
    name,
    fill: () => {
      if (!active) return { filled: 0, manual: [] };
      const example = TOOL_PRESETS[active]?.[index] || {};
      const next = Object.fromEntries(fields.map((field) => {
        const preserveReference = ['patient_id', 'image_id'].includes(field.key) && form[field.key] !== undefined && form[field.key] !== '';
        return [field.key, preserveReference ? form[field.key] : example[field.key]];
      }));
      setForm(next);
      setResult(null);
      return { filled: fields.filter((field) => next[field.key] !== undefined && next[field.key] !== '').length, manual: [] };
    },
  }));

  return (
    <NativeAIControls busy={loading} context={tool?.name || 'radiology assistant'} presets={presetChoices}><div className="page-layout">
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
                    <textarea data-ai-field={f.key} rows={f.key === 'findings' || f.key === 'current_findings' || f.key === 'findings_text' || f.key === 'report_a' || f.key === 'report_b' || f.key === 'report_text' ? 6 : 3}
                      style={inputStyle}
                      value={form[f.key] || ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      required={!!f.required} />
                  ) : f.type === 'select' ? (
                    <select data-ai-field={f.key} style={inputStyle}
                      value={form[f.key] || ''}
                      onChange={(e) => setField(f.key, e.target.value)}>
                      <option value="">Select...</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input data-ai-field={f.key} type={f.type || 'text'} style={inputStyle}
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
          <AIReport response={result?.result || result} title={`${tool?.name || 'AI'} results`} loading={loading} />
        )}
      </div>
    </div></NativeAIControls>
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
