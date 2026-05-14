const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db/pool');

const router = express.Router();

/**
 * GET /api/report-pdf/:analysis_id/pdf
 * Generate a formatted radiology report PDF.
 * Returns binary PDF (application/pdf).
 */
router.get('/:analysis_id/pdf', async (req, res) => {
  try {
    const { analysis_id } = req.params;

    // Fetch analysis with patient and radiologist details
    const result = await pool.query(`
      SELECT
        aa.*,
        p.name          AS patient_name,
        p.patient_id    AS patient_code,
        p.date_of_birth,
        p.gender,
        p.medical_history,
        p.phone         AS patient_phone,
        p.email         AS patient_email,
        ri.image_id     AS image_code,
        ri.modality,
        ri.body_part,
        ri.clinical_indication,
        ri.acquisition_date,
        ri.referring_physician,
        r.name          AS radiologist_name,
        r.license_number,
        r.specialization,
        r.email         AS radiologist_email
      FROM ai_analyses aa
      LEFT JOIN radiology_images ri ON aa.image_id    = ri.id
      LEFT JOIN patients          p  ON ri.patient_id = p.id
      LEFT JOIN radiologists      r  ON aa.reviewed_by = r.id
      WHERE aa.id = $1
    `, [parseInt(analysis_id, 10)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found.' });
    }

    const a = result.rows[0];

    // ── Build PDF ──────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="radiology-report-${analysis_id}.pdf"`
    );
    doc.pipe(res);

    const BRAND_COLOR = '#1a4480';
    const PAGE_WIDTH = doc.page.width - 100; // margin both sides

    // ── Header ─────────────────────────────────────────────────
    doc.rect(50, 40, PAGE_WIDTH, 60).fill(BRAND_COLOR);
    doc
      .fillColor('#ffffff')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('RADIOLOGY REPORT', 60, 55, { width: PAGE_WIDTH - 20 });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text('AI-Assisted Radiology AI Assistant', 60, 78);

    doc.moveDown(3);

    // ── Helper functions ───────────────────────────────────────
    const sectionHeader = (title) => {
      doc
        .moveDown(0.5)
        .rect(50, doc.y, PAGE_WIDTH, 18)
        .fill('#e8eef7');
      doc
        .fillColor(BRAND_COLOR)
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(title, 56, doc.y - 14);
      doc.fillColor('#000000').font('Helvetica').fontSize(10).moveDown(0.3);
    };

    const field = (label, value) => {
      doc
        .font('Helvetica-Bold')
        .text(`${label}: `, { continued: true })
        .font('Helvetica')
        .text(value || 'N/A');
    };

    // ── Patient Demographics ───────────────────────────────────
    sectionHeader('PATIENT DEMOGRAPHICS');
    doc.moveDown(0.3);
    field('Patient Name', a.patient_name);
    field('Patient ID', a.patient_code);
    field('Date of Birth', a.date_of_birth ? new Date(a.date_of_birth).toLocaleDateString() : null);
    field('Gender', a.gender);
    field('Phone', a.patient_phone);
    field('Email', a.patient_email);

    // ── Study Information ──────────────────────────────────────
    sectionHeader('STUDY INFORMATION');
    doc.moveDown(0.3);
    field('Analysis ID', a.analysis_id);
    field('Image ID', a.image_code);
    field('Modality', a.modality);
    field('Body Part', a.body_part);
    field('Acquisition Date', a.acquisition_date ? new Date(a.acquisition_date).toLocaleDateString() : null);
    field('Study Date (Analysis)', new Date(a.created_at).toLocaleDateString());
    field('Referring Physician', a.referring_physician);
    field('Clinical Indication', a.clinical_indication);

    // ── Radiologist ────────────────────────────────────────────
    sectionHeader('RADIOLOGIST');
    doc.moveDown(0.3);
    field('Name', a.radiologist_name || 'AI-Generated (Pending Review)');
    field('Specialization', a.specialization);
    field('License Number', a.license_number);
    field('Email', a.radiologist_email);

    // ── AI Analysis Type ───────────────────────────────────────
    sectionHeader('ANALYSIS');
    doc.moveDown(0.3);
    field('Analysis Type', a.analysis_type);
    field('AI Model', a.ai_model);
    field('Confidence Score', a.confidence_score ? `${a.confidence_score}%` : null);
    field('Status', a.status ? a.status.toUpperCase() : null);

    // ── Findings ───────────────────────────────────────────────
    sectionHeader('FINDINGS');
    doc.moveDown(0.3);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(a.findings || 'No findings recorded.', { width: PAGE_WIDTH });

    // ── Key Areas of Interest ──────────────────────────────────
    if (a.areas_of_interest) {
      let aoi = a.areas_of_interest;
      if (typeof aoi === 'string') {
        try { aoi = JSON.parse(aoi); } catch (_) { aoi = null; }
      }
      if (Array.isArray(aoi) && aoi.length > 0) {
        sectionHeader('AREAS OF INTEREST');
        doc.moveDown(0.3);
        aoi.forEach((item, idx) => {
          const label = item.region || item.description || JSON.stringify(item);
          doc.text(`${idx + 1}. ${label}`);
        });
      }
    }

    // ── Impression / Review Notes ──────────────────────────────
    if (a.review_notes) {
      sectionHeader('IMPRESSION / REPORT');
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(10).text(a.review_notes, { width: PAGE_WIDTH });
    }

    // ── Reviewer Notes ─────────────────────────────────────────
    if (a.reviewed_by) {
      sectionHeader('REVIEW');
      doc.moveDown(0.3);
      field('Reviewed By', a.radiologist_name);
      if (a.review_notes) field('Review Notes', a.review_notes);
    }

    // ── Disclaimer ─────────────────────────────────────────────
    doc.moveDown(1);
    doc
      .rect(50, doc.y, PAGE_WIDTH, 40)
      .fill('#fff3cd');
    doc
      .fillColor('#856404')
      .fontSize(8)
      .font('Helvetica')
      .text(
        'DISCLAIMER: This report was generated with AI assistance and is intended for use by qualified medical professionals only. '
        + 'AI-generated content must be reviewed and confirmed by a licensed radiologist before clinical use. '
        + 'Not a substitute for professional medical judgment.',
        56,
        doc.y - 34,
        { width: PAGE_WIDTH - 12 }
      );

    // ── Footer ─────────────────────────────────────────────────
    doc.fillColor('#666666').fontSize(8).text(
      `Generated: ${new Date().toISOString()} | Radiology AI Assistant`,
      50,
      doc.page.height - 40,
      { width: PAGE_WIDTH, align: 'center' }
    );

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Failed to generate PDF report.' });
    }
  }
});

module.exports = router;
