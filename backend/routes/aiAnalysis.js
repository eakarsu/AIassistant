const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');
const openRouterService = require('../services/openRouterService');
const notificationService = require('../services/notificationService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// ── Rate limiter: 20 AI requests per user per hour ─────────────
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many AI requests. Limit is 20 per hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Validation: allowed image types ───────────────────────────
const ALLOWED_IMAGE_TYPES = ['xray', 'ct', 'mri', 'ultrasound', 'pet'];

// ── Helper: validate patient exists ───────────────────────────
async function validatePatient(patient_id) {
  const result = await pool.query('SELECT id, name, date_of_birth, gender, medical_history, email FROM patients WHERE id = $1', [patient_id]);
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

// ══════════════════════════════════════════════════════════════
// POST /api/ai-analysis/ai-analyze
// ══════════════════════════════════════════════════════════════
router.post('/ai-analyze', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { patient_id, image_type, findings_text, patient_history } = req.body;

    // Validate image_type
    if (!image_type || !ALLOWED_IMAGE_TYPES.includes(image_type.toLowerCase())) {
      return res.status(400).json({
        error: `image_type must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      });
    }

    if (!findings_text) {
      return res.status(400).json({ error: 'findings_text is required.' });
    }

    // Validate patient exists if patient_id provided
    let patient = null;
    if (patient_id) {
      patient = await validatePatient(parseInt(patient_id, 10));
      if (!patient) {
        return res.status(404).json({ error: `Patient with id ${patient_id} not found.` });
      }
    }

    // Call OpenRouter AI
    const aiResult = await openRouterService.analyzeRadiology({
      patient_id,
      image_type: image_type.toLowerCase(),
      findings_text,
      patient_history: patient_history || (patient && patient.medical_history) || '',
    });

    // Persist to ai_analyses table
    const analysisId = `ANL-AI-${Date.now()}`;
    const insertResult = await pool.query(
      `INSERT INTO ai_analyses
         (analysis_id, image_id, analysis_type, findings, confidence_score, areas_of_interest, ai_model, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
       RETURNING *`,
      [
        analysisId,
        null,
        `AI-${image_type.toUpperCase()}-Analysis`,
        aiResult.preliminary_impression || JSON.stringify(aiResult),
        85.0,
        JSON.stringify(aiResult.key_findings || []),
        'anthropic/claude-3-5-sonnet-20241022',
      ]
    );

    const saved = insertResult.rows[0];

    // Also persist to ai_results JSONB store for audit pattern
    await openRouterService.persistAIResult({
      feature: 'ai-analyze',
      user_id: req.user && (req.user.id || req.user.userId),
      entity_type: 'patient',
      entity_id: patient_id ? parseInt(patient_id, 10) : null,
      prompt_summary: `${image_type} for patient ${patient_id || 'N/A'}`,
      result: aiResult,
    });

    res.status(201).json({
      message: 'AI analysis completed.',
      analysis_id: saved.id,
      analysis_record: saved,
      ai_result: aiResult,
    });
  } catch (err) {
    console.error('ai-analyze error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to run AI analysis.' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/ai-analysis/generate-report
// ══════════════════════════════════════════════════════════════
router.post('/generate-report', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { analysis_id } = req.body;

    if (!analysis_id) {
      return res.status(400).json({ error: 'analysis_id is required.' });
    }

    // Fetch analysis + patient info
    const analysisResult = await pool.query(`
      SELECT aa.*,
        p.name as patient_name, p.date_of_birth, p.gender, p.medical_history, p.patient_id as patient_code,
        ri.modality, ri.body_part, ri.clinical_indication, ri.referring_physician,
        r.name as radiologist_name, r.specialization, r.license_number
      FROM ai_analyses aa
      LEFT JOIN radiology_images ri ON aa.image_id = ri.id
      LEFT JOIN radiologists r ON aa.reviewed_by = r.id
      LEFT JOIN patients p ON ri.patient_id = p.id
      WHERE aa.id = $1
    `, [parseInt(analysis_id, 10)]);

    if (analysisResult.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    const analysis = analysisResult.rows[0];

    const patientInfo = {
      name: analysis.patient_name || 'Unknown',
      date_of_birth: analysis.date_of_birth,
      gender: analysis.gender,
      medical_history: analysis.medical_history,
      patient_id: analysis.patient_code,
    };

    const analysisData = {
      image_type: analysis.analysis_type,
      modality: analysis.modality,
      body_part: analysis.body_part,
      clinical_indication: analysis.clinical_indication,
      preliminary_impression: analysis.findings,
      radiologist: analysis.radiologist_name,
      license_number: analysis.license_number,
    };

    const report = await openRouterService.generateReport(patientInfo, analysisData);

    // Update the analysis with the generated report
    await pool.query(
      `UPDATE ai_analyses SET review_notes = $1, updated_at = NOW() WHERE id = $2`,
      [report.report_text || JSON.stringify(report), parseInt(analysis_id, 10)]
    );

    await openRouterService.persistAIResult({
      feature: 'generate-report',
      user_id: req.user && (req.user.id || req.user.userId),
      entity_type: 'analysis',
      entity_id: parseInt(analysis_id, 10),
      prompt_summary: `analysis ${analysis_id} -> ${analysis.analysis_type || 'report'}`,
      result: report,
    });

    res.json({
      message: 'Report generated successfully.',
      report,
    });
  } catch (err) {
    console.error('generate-report error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate report.' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/ai-analysis/critical-findings-check
// ══════════════════════════════════════════════════════════════
router.post('/critical-findings-check', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { findings_text } = req.body;

    if (!findings_text) {
      return res.status(400).json({ error: 'findings_text is required.' });
    }

    const result = await openRouterService.checkCriticalFindings(findings_text);

    // If critical, send email notification
    if (result.is_critical || result.notify_immediately) {
      try {
        await notificationService.sendCriticalFindingAlert(
          { name: 'On-Call Radiologist', email: process.env.RADIOLOGIST_ALERT_EMAIL || process.env.SMTP_FROM },
          { name: 'Patient (from findings check)', id: 'N/A' },
          result.findings || []
        );
      } catch (notifyErr) {
        console.error('Notification error (non-fatal):', notifyErr.message);
      }
    }

    await openRouterService.persistAIResult({
      feature: 'critical-findings-check',
      user_id: req.user && (req.user.id || req.user.userId),
      entity_type: 'findings',
      entity_id: null,
      prompt_summary: (findings_text || '').slice(0, 200),
      result,
    });

    res.json(result);
  } catch (err) {
    console.error('critical-findings-check error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to check critical findings.' });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/ai-analysis/follow-up-recommendations
// ══════════════════════════════════════════════════════════════
router.post('/follow-up-recommendations', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { patient_id, diagnosis } = req.body;

    if (!diagnosis) {
      return res.status(400).json({ error: 'diagnosis is required.' });
    }

    // Fetch patient data if id provided
    let patient = {};
    if (patient_id) {
      const p = await validatePatient(parseInt(patient_id, 10));
      if (!p) {
        return res.status(404).json({ error: `Patient with id ${patient_id} not found.` });
      }
      patient = p;
    }

    const recommendations = await openRouterService.generateFollowUp(patient, diagnosis);

    await openRouterService.persistAIResult({
      feature: 'follow-up-recommendations',
      user_id: req.user && (req.user.id || req.user.userId),
      entity_type: 'patient',
      entity_id: patient_id ? parseInt(patient_id, 10) : null,
      prompt_summary: (diagnosis || '').slice(0, 200),
      result: recommendations,
    });

    res.json({
      patient_id: patient_id || null,
      diagnosis,
      recommendations,
    });
  } catch (err) {
    console.error('follow-up-recommendations error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate follow-up recommendations.' });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/ai-analysis/stream?patientId=X
// SSE: streams real-time report generation
// ══════════════════════════════════════════════════════════════
router.get('/stream', async (req, res) => {
  const { patientId } = req.query;

  if (!patientId) {
    return res.status(400).json({ error: 'patientId query param is required.' });
  }

  // Validate patient
  const patient = await validatePatient(parseInt(patientId, 10)).catch(() => null);
  if (!patient) {
    return res.status(404).json({ error: 'Patient not found.' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (eventType, data) => {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const steps = [
    'Loading patient history...',
    'Retrieving imaging studies...',
    'Analyzing findings with AI...',
    'Generating clinical impression...',
    'Drafting report sections...',
    'Finalizing radiology report...',
  ];

  try {
    for (let i = 0; i < steps.length; i++) {
      sendEvent('progress', { step: i + 1, total: steps.length, message: steps[i] });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Fetch latest analysis for this patient
    const analysisResult = await pool.query(`
      SELECT aa.*, ri.modality, ri.body_part, ri.clinical_indication
      FROM ai_analyses aa
      LEFT JOIN radiology_images ri ON aa.image_id = ri.id
      WHERE ri.patient_id = $1
      ORDER BY aa.created_at DESC
      LIMIT 1
    `, [patientId]);

    const analysis = analysisResult.rows[0] || {};

    const report = await openRouterService.generateReport(patient, {
      image_type: analysis.analysis_type || 'Radiology Study',
      modality: analysis.modality || 'Not specified',
      body_part: analysis.body_part || 'Not specified',
      preliminary_impression: analysis.findings || 'No prior findings.',
    });

    sendEvent('complete', { patient, report });
    res.end();
  } catch (err) {
    sendEvent('error', { message: err.message || 'Report generation failed.' });
    res.end();
  }
});

// ══════════════════════════════════════════════════════════════
// Audit-driven NEW AI features
// ══════════════════════════════════════════════════════════════

const userId = (req) => req.user ? (req.user.id || req.user.userId) : null;

// POST /report-templating
router.post('/report-templating', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { modality, body_part, findings, specialty } = req.body;
    if (!findings) return res.status(400).json({ error: 'findings is required.' });

    const result = await openRouterService.reportTemplating({ modality, body_part, findings, specialty });
    const saved = await openRouterService.persistAIResult({
      feature: 'report-templating',
      user_id: userId(req),
      entity_type: 'image',
      entity_id: null,
      prompt_summary: `${modality || ''} ${body_part || ''}`,
      result,
    });
    res.json({ result, saved_id: saved && saved.id });
  } catch (err) {
    console.error('report-templating error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /prior-study-comparison
router.post('/prior-study-comparison', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { current_findings, prior_studies, modality, body_part, patient_id } = req.body;
    if (!current_findings) return res.status(400).json({ error: 'current_findings is required.' });

    // If patient_id provided but no priors, attempt to load priors from DB.
    let priors = prior_studies;
    if ((!priors || priors.length === 0) && patient_id) {
      try {
        const priorRes = await pool.query(
          `SELECT study_id, study_date, modality, body_part, summary as findings
           FROM prior_studies
           WHERE patient_id = $1
           ORDER BY study_date DESC
           LIMIT 10`,
          [parseInt(patient_id, 10)]
        );
        priors = priorRes.rows;
      } catch (_) { priors = []; }
    }

    const result = await openRouterService.priorStudyComparison({
      current_findings, prior_studies: priors || [], modality, body_part,
    });
    const saved = await openRouterService.persistAIResult({
      feature: 'prior-study-comparison',
      user_id: userId(req),
      entity_type: 'patient',
      entity_id: patient_id ? parseInt(patient_id, 10) : null,
      prompt_summary: `${modality || ''} ${body_part || ''}`,
      result,
    });
    res.json({ result, prior_studies_used: (priors || []).length, saved_id: saved && saved.id });
  } catch (err) {
    console.error('prior-study-comparison error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /turnaround-predictor
router.post('/turnaround-predictor', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { radiologist, modality, complexity, queue_length } = req.body;
    const result = await openRouterService.turnaroundPredictor({
      radiologist, modality, complexity, queue_length,
    });
    const saved = await openRouterService.persistAIResult({
      feature: 'turnaround-predictor',
      user_id: userId(req),
      entity_type: 'radiologist',
      entity_id: radiologist && radiologist.id ? parseInt(radiologist.id, 10) : null,
      prompt_summary: `${modality || ''} complexity=${complexity || ''}`,
      result,
    });
    res.json({ result, saved_id: saved && saved.id });
  } catch (err) {
    console.error('turnaround-predictor error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /incidental-findings
router.post('/incidental-findings', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { findings_text, primary_indication, patient_id } = req.body;
    if (!findings_text) return res.status(400).json({ error: 'findings_text is required.' });

    const result = await openRouterService.incidentalFindings({ findings_text, primary_indication });
    const saved = await openRouterService.persistAIResult({
      feature: 'incidental-findings',
      user_id: userId(req),
      entity_type: 'patient',
      entity_id: patient_id ? parseInt(patient_id, 10) : null,
      prompt_summary: primary_indication || 'no indication',
      result,
    });
    res.json({ result, saved_id: saved && saved.id });
  } catch (err) {
    console.error('incidental-findings error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /qa-audit
router.post('/qa-audit', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { report_a, report_b, image_summary, image_id } = req.body;
    if (!report_a || !report_b) {
      return res.status(400).json({ error: 'report_a and report_b are required.' });
    }
    const result = await openRouterService.qaAuditCompare({ report_a, report_b, image_summary });
    const saved = await openRouterService.persistAIResult({
      feature: 'qa-audit',
      user_id: userId(req),
      entity_type: 'image',
      entity_id: image_id ? parseInt(image_id, 10) : null,
      prompt_summary: image_summary || 'two-radiologist comparison',
      result,
    });
    res.json({ result, saved_id: saved && saved.id });
  } catch (err) {
    console.error('qa-audit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /insurance-preauth
router.post('/insurance-preauth', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { procedure_code, diagnosis, payer, patient_history, patient_id } = req.body;
    if (!procedure_code) return res.status(400).json({ error: 'procedure_code is required.' });

    const result = await openRouterService.insurancePreauth({
      procedure_code, diagnosis, payer, patient_history,
    });
    const saved = await openRouterService.persistAIResult({
      feature: 'insurance-preauth',
      user_id: userId(req),
      entity_type: 'patient',
      entity_id: patient_id ? parseInt(patient_id, 10) : null,
      prompt_summary: `${procedure_code} / ${payer || 'no payer'}`,
      result,
    });
    res.json({ result, saved_id: saved && saved.id });
  } catch (err) {
    console.error('insurance-preauth error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /patient-portal-summary
router.post('/patient-portal-summary', authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { report_text, reading_level, patient_id } = req.body;
    if (!report_text) return res.status(400).json({ error: 'report_text is required.' });

    const result = await openRouterService.patientPortalSummary({ report_text, reading_level });
    const saved = await openRouterService.persistAIResult({
      feature: 'patient-portal-summary',
      user_id: userId(req),
      entity_type: 'patient',
      entity_id: patient_id ? parseInt(patient_id, 10) : null,
      prompt_summary: `level=${reading_level || 'grade 7'}`,
      result,
    });
    res.json({ result, saved_id: saved && saved.id });
  } catch (err) {
    console.error('patient-portal-summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /history — paginated ai_results history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const feature = req.query.feature ? String(req.query.feature) : null;

    const params = [];
    let where = '';
    if (feature) {
      params.push(feature);
      where = `WHERE feature = $${params.length}`;
    }
    const countRes = await pool.query(`SELECT COUNT(*) FROM ai_results ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(limit);
    params.push(offset);
    const dataRes = await pool.query(
      `SELECT id, feature, user_id, entity_type, entity_id, prompt_summary, result, model, created_at
       FROM ai_results ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      data: dataRes.rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('ai-history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
