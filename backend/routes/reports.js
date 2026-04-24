const express = require('express');
const pool = require('../db/pool');
const openRouterService = require('../services/openrouter');

const router = express.Router();

// GET /api/reports
router.get('/', async (req, res) => {
  try {
    const { status, patient_id, radiologist_id, report_type, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT rp.*,
        p.name as patient_name, p.patient_id as patient_code,
        r.name as radiologist_name,
        ri.image_id as image_code, ri.modality, ri.body_part
      FROM reports rp
      LEFT JOIN patients p ON rp.patient_id = p.id
      LEFT JOIN radiologists r ON rp.radiologist_id = r.id
      LEFT JOIN radiology_images ri ON rp.image_id = ri.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`rp.status = $${params.length}`);
    }
    if (patient_id) {
      params.push(parseInt(patient_id, 10));
      conditions.push(`rp.patient_id = $${params.length}`);
    }
    if (radiologist_id) {
      params.push(parseInt(radiologist_id, 10));
      conditions.push(`rp.radiologist_id = $${params.length}`);
    }
    if (report_type) {
      params.push(`%${report_type}%`);
      conditions.push(`rp.report_type ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY rp.created_at DESC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM reports rp WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM reports';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      reports: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT rp.*,
        p.name as patient_name, p.patient_id as patient_code, p.date_of_birth, p.gender, p.medical_history,
        r.name as radiologist_name, r.specialization,
        ri.image_id as image_code, ri.modality, ri.body_part, ri.description as image_description, ri.clinical_indication
      FROM reports rp
      LEFT JOIN patients p ON rp.patient_id = p.id
      LEFT JOIN radiologists r ON rp.radiologist_id = r.id
      LEFT JOIN radiology_images ri ON rp.image_id = ri.id
      WHERE rp.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching report:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// POST /api/reports
router.post('/', async (req, res) => {
  try {
    const {
      report_id, image_id, patient_id, radiologist_id, report_type,
      clinical_history, technique, findings, impression, recommendations,
      ai_draft, final_report, status, compliance_check
    } = req.body;

    if (!report_id || !report_type) {
      return res.status(400).json({ error: 'report_id and report_type are required' });
    }

    const result = await pool.query(
      `INSERT INTO reports (report_id, image_id, patient_id, radiologist_id, report_type, clinical_history, technique, findings, impression, recommendations, ai_draft, final_report, status, compliance_check)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [report_id, image_id, patient_id, radiologist_id, report_type, clinical_history, technique, findings, impression, recommendations, ai_draft, final_report, status || 'draft', compliance_check || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Report with this ID already exists' });
    }
    console.error('Error creating report:', err);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

// PUT /api/reports/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      report_type, clinical_history, technique, findings, impression,
      recommendations, ai_draft, final_report, status, compliance_check,
      radiologist_id
    } = req.body;

    const result = await pool.query(
      `UPDATE reports SET
        report_type = COALESCE($1, report_type),
        clinical_history = COALESCE($2, clinical_history),
        technique = COALESCE($3, technique),
        findings = COALESCE($4, findings),
        impression = COALESCE($5, impression),
        recommendations = COALESCE($6, recommendations),
        ai_draft = COALESCE($7, ai_draft),
        final_report = COALESCE($8, final_report),
        status = COALESCE($9, status),
        compliance_check = COALESCE($10, compliance_check),
        radiologist_id = COALESCE($11, radiologist_id),
        updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [report_type, clinical_history, technique, findings, impression, recommendations, ai_draft, final_report, status, compliance_check, radiologist_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating report:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// DELETE /api/reports/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM reports WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ message: 'Report deleted successfully', report: result.rows[0] });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// POST /api/reports/:id/generate-draft - Generate AI report draft
router.post('/:id/generate-draft', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the report with associated data
    const reportResult = await pool.query(`
      SELECT rp.*,
        p.name as patient_name, p.date_of_birth, p.gender, p.medical_history, p.allergies,
        ri.modality, ri.body_part, ri.description as image_description, ri.clinical_indication, ri.referring_physician
      FROM reports rp
      LEFT JOIN patients p ON rp.patient_id = p.id
      LEFT JOIN radiology_images ri ON rp.image_id = ri.id
      WHERE rp.id = $1
    `, [id]);

    if (reportResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult.rows[0];

    // Check if there are AI analysis findings for this image
    let analysisFindings = report.findings || '';
    if (report.image_id) {
      const analysisResult = await pool.query(
        'SELECT findings FROM ai_analyses WHERE image_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1',
        [report.image_id, 'completed']
      );
      if (analysisResult.rows.length > 0) {
        analysisFindings = analysisResult.rows[0].findings || analysisFindings;
      }
    }

    const patientInfo = {
      name: report.patient_name,
      date_of_birth: report.date_of_birth,
      gender: report.gender,
      medical_history: report.medical_history,
      allergies: report.allergies,
    };

    const imageDetails = {
      modality: report.modality,
      body_part: report.body_part,
      description: report.image_description,
      clinical_indication: report.clinical_indication,
      referring_physician: report.referring_physician,
    };

    // Call OpenRouter to generate the report draft
    const aiReport = await openRouterService.generateReport(patientInfo, analysisFindings, imageDetails);

    // Update the report with AI-generated draft
    const updatedReport = await pool.query(
      `UPDATE reports SET
        ai_draft = $1,
        clinical_history = COALESCE(clinical_history, $2),
        technique = COALESCE(technique, $3),
        findings = COALESCE(findings, $4),
        impression = COALESCE(impression, $5),
        recommendations = COALESCE(recommendations, $6),
        status = CASE WHEN status = 'draft' THEN 'draft' ELSE status END,
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [
        aiReport.report_text || JSON.stringify(aiReport),
        aiReport.clinical_history,
        aiReport.technique,
        aiReport.findings,
        aiReport.impression,
        aiReport.recommendations,
        id,
      ]
    );

    res.json({
      message: 'AI draft generated successfully',
      report: updatedReport.rows[0],
      ai_draft: aiReport,
    });
  } catch (err) {
    console.error('Error generating report draft:', err);
    res.status(500).json({ error: 'Failed to generate report draft', details: err.message });
  }
});

// POST /api/reports/:id/finalize - Finalize a report
router.post('/:id/finalize', async (req, res) => {
  try {
    const { id } = req.params;
    const { final_report } = req.body;

    // Get current report
    const currentReport = await pool.query('SELECT * FROM reports WHERE id = $1', [id]);
    if (currentReport.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = currentReport.rows[0];

    if (report.status === 'finalized') {
      return res.status(400).json({ error: 'Report is already finalized' });
    }

    // Build final report text from components if not provided
    const finalText = final_report || [
      `CLINICAL HISTORY: ${report.clinical_history || 'Not provided'}`,
      `TECHNIQUE: ${report.technique || 'Not provided'}`,
      `FINDINGS: ${report.findings || 'Not provided'}`,
      `IMPRESSION: ${report.impression || 'Not provided'}`,
      `RECOMMENDATIONS: ${report.recommendations || 'None'}`,
    ].join('\n\n');

    const result = await pool.query(
      `UPDATE reports SET
        final_report = $1,
        status = 'finalized',
        signed_date = NOW(),
        updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [finalText, id]
    );

    // Update associated image status
    if (report.image_id) {
      await pool.query(
        'UPDATE radiology_images SET status = $1, updated_at = NOW() WHERE id = $2',
        ['reported', report.image_id]
      );
    }

    res.json({
      message: 'Report finalized successfully',
      report: result.rows[0],
    });
  } catch (err) {
    console.error('Error finalizing report:', err);
    res.status(500).json({ error: 'Failed to finalize report' });
  }
});

// POST /api/reports/:id/compliance-check - Mark compliance as checked
router.post('/:id/compliance-check', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE reports SET compliance_check = true, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({
      message: 'Compliance check completed',
      report: result.rows[0],
    });
  } catch (err) {
    console.error('Error performing compliance check:', err);
    res.status(500).json({ error: 'Failed to perform compliance check' });
  }
});

module.exports = router;
