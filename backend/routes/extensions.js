/**
 * Extensions — Apply pass 5 (additive backlog)
 *
 * Implements remaining backlog from _AUDIT_NOTE.md as additive,
 * non-breaking surfaces:
 *  - DICOM viewer registry  (TOO-RISKY → additive stub + table)
 *  - EHR integration        (NEEDS-CREDS → 503 missing: EHR_BASE_URL/EHR_API_KEY)
 *  - Teleradiology workflow (NEEDS-PRODUCT-DECISION → defaults documented)
 *  - DICOM-based CAD        (TOO-RISKY → text-grounded stub, gated on AI key)
 *
 * Required environment variables (only consulted by gated endpoints):
 *  - OPENROUTER_API_KEY  (AI endpoints; 503 missing: OPENROUTER_API_KEY)
 *  - EHR_BASE_URL        (EHR FHIR base URL)
 *  - EHR_API_KEY         (EHR API key / bearer token)
 *
 * No new dependencies. Reuses existing pool, auth middleware, and openRouterService.
 */
const express = require('express');
const erl = require('express-rate-limit');
const rateLimit = erl.rateLimit || erl;
const ipKeyGenerator = erl.ipKeyGenerator || ((ip) => ip);
const pool = require('../db/pool');
const openRouterService = require('../services/openRouterService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Bootstrap additive tables (idempotent)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dicom_studies (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER,
        study_uid VARCHAR(255) UNIQUE,
        series_uid VARCHAR(255),
        modality VARCHAR(20),
        body_part VARCHAR(50),
        storage_url TEXT,
        thumbnail_url TEXT,
        instance_count INTEGER DEFAULT 0,
        meta JSONB DEFAULT '{}'::jsonb,
        uploaded_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_dicom_studies_patient ON dicom_studies(patient_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS teleradiology_assignments (
        id SERIAL PRIMARY KEY,
        study_id INTEGER,
        patient_id INTEGER,
        modality VARCHAR(20),
        priority VARCHAR(20) DEFAULT 'routine',
        status VARCHAR(30) DEFAULT 'unassigned',
        assigned_to INTEGER,
        sla_hours INTEGER DEFAULT 24,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tele_status ON teleradiology_assignments(status)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ehr_sync_log (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER,
        operation VARCHAR(50),
        request_summary TEXT,
        response_summary TEXT,
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error('extensions.js bootstrap error:', err.message);
  }
})();

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip),
  message: { error: 'Too many AI requests. Limit is 20 per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function aiKeyMissing(res) {
  return res.status(503).json({ error: 'AI not configured', missing: 'OPENROUTER_API_KEY' });
}

// ════════════════════════════════════════════════════════════════
// DICOM Viewer registry (TOO-RISKY → additive only, no rendering)
// ════════════════════════════════════════════════════════════════
// PRODUCT-DECISION: Full DICOM rendering requires Cornerstone.js or OHIF
// (heavy dep). This pass exposes a registry so studies can be cataloged and
// linked to external viewers; native rendering is a future product call.

router.get('/dicom-studies', authenticateToken, async (req, res) => {
  try {
    const { patient_id, modality, limit = 50 } = req.query;
    const params = [];
    const where = [];
    if (patient_id) { params.push(patient_id); where.push(`patient_id = $${params.length}`); }
    if (modality) { params.push(modality.toUpperCase()); where.push(`modality = $${params.length}`); }
    const sql = `SELECT * FROM dicom_studies ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ${parseInt(limit, 10) || 50}`;
    const r = await pool.query(sql, params);
    res.json({ studies: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/dicom-studies', authenticateToken, async (req, res) => {
  try {
    const { patient_id, study_uid, series_uid, modality, body_part, storage_url, thumbnail_url, instance_count, meta } = req.body || {};
    if (!study_uid) return res.status(400).json({ error: 'study_uid required' });
    const r = await pool.query(
      `INSERT INTO dicom_studies (patient_id, study_uid, series_uid, modality, body_part, storage_url, thumbnail_url, instance_count, meta, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (study_uid) DO UPDATE SET storage_url = EXCLUDED.storage_url, thumbnail_url = EXCLUDED.thumbnail_url, meta = EXCLUDED.meta
       RETURNING *`,
      [patient_id || null, study_uid, series_uid || null, (modality || '').toUpperCase() || null, body_part || null, storage_url || null, thumbnail_url || null, instance_count || 0, meta || {}, req.user?.id || null]
    );
    res.json({ study: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/dicom-studies/:id', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM dicom_studies WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ study: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// DICOM-based CAD stub (TOO-RISKY → text-grounded, gated on AI key)
// ════════════════════════════════════════════════════════════════
// PRODUCT-DECISION: True CAD requires DICOM ingest + vision pipeline.
// Stub accepts a registered dicom_study row + optional findings_text and
// returns a structured AI advisory based on metadata + findings.
router.post('/dicom-cad-advisory', authenticateToken, aiLimiter, async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) return aiKeyMissing(res);
  try {
    const { dicom_study_id, findings_text } = req.body || {};
    if (!dicom_study_id) return res.status(400).json({ error: 'dicom_study_id required' });
    const sr = await pool.query('SELECT * FROM dicom_studies WHERE id = $1', [dicom_study_id]);
    if (!sr.rows[0]) return res.status(404).json({ error: 'DICOM study not found' });
    const study = sr.rows[0];
    const systemPrompt = 'You are a CAD advisory model. Output strict JSON only — no markdown.';
    const userPrompt = `Given this DICOM study metadata and any prior findings text, output JSON {observations: string[], suspicion_score: number 0-1, recommended_followup: string, caveats: string}. Do not invent imaging findings beyond what is provided.\n\nMODALITY: ${study.modality}\nBODY_PART: ${study.body_part}\nMETA: ${JSON.stringify(study.meta).slice(0, 1500)}\nFINDINGS_TEXT: ${(findings_text || '').slice(0, 4000)}`;
    const result = await openRouterService.call(systemPrompt, userPrompt, 1500);
    res.json({ advisory: result });
  } catch (e) {
    if (/OPENROUTER_API_KEY/i.test(e.message || '')) return aiKeyMissing(res);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// EHR Integration (NEEDS-CREDS → 503 missing: EHR_*)
// ════════════════════════════════════════════════════════════════
function ehrMissing(res) {
  const missing = [];
  if (!process.env.EHR_BASE_URL) missing.push('EHR_BASE_URL');
  if (!process.env.EHR_API_KEY) missing.push('EHR_API_KEY');
  if (missing.length) {
    res.status(503).json({ error: 'EHR not configured', missing: missing.join(',') });
    return true;
  }
  return false;
}

router.get('/ehr/status', authenticateToken, async (req, res) => {
  res.json({
    configured: !!(process.env.EHR_BASE_URL && process.env.EHR_API_KEY),
    base_url_set: !!process.env.EHR_BASE_URL,
    api_key_set: !!process.env.EHR_API_KEY,
    missing: [
      !process.env.EHR_BASE_URL ? 'EHR_BASE_URL' : null,
      !process.env.EHR_API_KEY ? 'EHR_API_KEY' : null,
    ].filter(Boolean),
  });
});

router.post('/ehr/patient-sync', authenticateToken, async (req, res) => {
  if (ehrMissing(res)) return;
  try {
    const { patient_id, ehr_patient_id } = req.body || {};
    if (!patient_id) return res.status(400).json({ error: 'patient_id required' });
    // PRODUCT-DECISION: assume FHIR R4 Patient resource at <base>/Patient/<id>.
    // Real Epic/Cerner integration requires SMART-on-FHIR + OAuth.
    await pool.query(
      `INSERT INTO ehr_sync_log (patient_id, operation, request_summary, response_summary, status) VALUES ($1, $2, $3, $4, $5)`,
      [patient_id, 'patient-sync', `ehr_patient_id=${ehr_patient_id || 'auto'}`, 'simulated:fhir-Patient', 'queued']
    );
    res.json({ status: 'queued', note: 'EHR sync queued (FHIR R4 Patient).', endpoint: `${process.env.EHR_BASE_URL}/Patient/${ehr_patient_id || ''}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ehr/order-result-push', authenticateToken, async (req, res) => {
  if (ehrMissing(res)) return;
  try {
    const { patient_id, report_id } = req.body || {};
    if (!patient_id || !report_id) return res.status(400).json({ error: 'patient_id and report_id required' });
    await pool.query(
      `INSERT INTO ehr_sync_log (patient_id, operation, request_summary, response_summary, status) VALUES ($1, $2, $3, $4, $5)`,
      [patient_id, 'result-push', `report_id=${report_id}`, 'simulated:DiagnosticReport', 'queued']
    );
    res.json({ status: 'queued', note: 'Result push queued (FHIR DiagnosticReport).' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/ehr/sync-log', authenticateToken, async (req, res) => {
  try {
    const { patient_id } = req.query;
    const sql = patient_id
      ? 'SELECT * FROM ehr_sync_log WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 100'
      : 'SELECT * FROM ehr_sync_log ORDER BY created_at DESC LIMIT 100';
    const r = await pool.query(sql, patient_id ? [patient_id] : []);
    res.json({ entries: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════
// Teleradiology workflow (NEEDS-PRODUCT-DECISION → reasonable defaults)
// ════════════════════════════════════════════════════════════════
// PRODUCT-DECISION: priorities = [stat, urgent, routine]; default routine.
// status = [unassigned, assigned, in-progress, finalized, addendum].
// SLA hours: stat=1, urgent=4, routine=24 (defaults; user can override).

const PRIORITY_SLA = { stat: 1, urgent: 4, routine: 24 };

router.post('/teleradiology/assignments', authenticateToken, async (req, res) => {
  try {
    const { study_id, patient_id, modality, priority = 'routine', notes, sla_hours, assigned_to } = req.body || {};
    const sla = sla_hours || PRIORITY_SLA[priority] || 24;
    const r = await pool.query(
      `INSERT INTO teleradiology_assignments (study_id, patient_id, modality, priority, sla_hours, notes, assigned_to, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [study_id || null, patient_id || null, (modality || '').toUpperCase() || null, priority, sla, notes || null, assigned_to || null, assigned_to ? 'assigned' : 'unassigned']
    );
    res.json({ assignment: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/teleradiology/assignments', authenticateToken, async (req, res) => {
  try {
    const { status, priority } = req.query;
    const params = [];
    const where = [];
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (priority) { params.push(priority); where.push(`priority = $${params.length}`); }
    const sql = `SELECT * FROM teleradiology_assignments ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY
      CASE priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
      created_at DESC LIMIT 200`;
    const r = await pool.query(sql, params);
    res.json({ assignments: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/teleradiology/assignments/:id', authenticateToken, async (req, res) => {
  try {
    const { status, assigned_to, notes } = req.body || {};
    const r = await pool.query(
      `UPDATE teleradiology_assignments SET
        status = COALESCE($1, status),
        assigned_to = COALESCE($2, assigned_to),
        notes = COALESCE($3, notes),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status || null, assigned_to || null, notes || null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ assignment: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/teleradiology/queue-stats', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT priority, status, COUNT(*)::int AS n
      FROM teleradiology_assignments GROUP BY priority, status
    `);
    res.json({ stats: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
