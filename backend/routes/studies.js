const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/studies
router.get('/', async (req, res) => {
  try {
    const { patient_id, modality, body_part, follow_up_required, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT ps.*, p.name as patient_name, p.patient_id as patient_code
      FROM prior_studies ps
      LEFT JOIN patients p ON ps.patient_id = p.id
    `;
    const params = [];
    const conditions = [];

    if (patient_id) {
      params.push(parseInt(patient_id, 10));
      conditions.push(`ps.patient_id = $${params.length}`);
    }
    if (modality) {
      params.push(modality);
      conditions.push(`ps.modality = $${params.length}`);
    }
    if (body_part) {
      params.push(`%${body_part}%`);
      conditions.push(`ps.body_part ILIKE $${params.length}`);
    }
    if (follow_up_required !== undefined) {
      params.push(follow_up_required === 'true');
      conditions.push(`ps.follow_up_required = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY ps.study_date DESC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM prior_studies ps WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM prior_studies';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      studies: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching studies:', err);
    res.status(500).json({ error: 'Failed to fetch studies' });
  }
});

// GET /api/studies/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT ps.*, p.name as patient_name, p.patient_id as patient_code
      FROM prior_studies ps
      LEFT JOIN patients p ON ps.patient_id = p.id
      WHERE ps.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching study:', err);
    res.status(500).json({ error: 'Failed to fetch study' });
  }
});

// POST /api/studies
router.post('/', async (req, res) => {
  try {
    const {
      study_id, patient_id, modality, body_part, study_date,
      diagnosis, findings, radiologist_name, institution,
      similarity_tags, study_notes, outcome, follow_up_required
    } = req.body;

    if (!study_id || !patient_id || !modality || !body_part || !study_date) {
      return res.status(400).json({ error: 'study_id, patient_id, modality, body_part, and study_date are required' });
    }

    const result = await pool.query(
      `INSERT INTO prior_studies (study_id, patient_id, modality, body_part, study_date, diagnosis, findings, radiologist_name, institution, similarity_tags, study_notes, outcome, follow_up_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [study_id, patient_id, modality, body_part, study_date, diagnosis, findings, radiologist_name, institution, similarity_tags, study_notes, outcome, follow_up_required || false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Study with this ID already exists' });
    }
    console.error('Error creating study:', err);
    res.status(500).json({ error: 'Failed to create study' });
  }
});

// PUT /api/studies/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      modality, body_part, study_date, diagnosis, findings,
      radiologist_name, institution, similarity_tags, study_notes,
      outcome, follow_up_required
    } = req.body;

    const result = await pool.query(
      `UPDATE prior_studies SET
        modality = COALESCE($1, modality),
        body_part = COALESCE($2, body_part),
        study_date = COALESCE($3, study_date),
        diagnosis = COALESCE($4, diagnosis),
        findings = COALESCE($5, findings),
        radiologist_name = COALESCE($6, radiologist_name),
        institution = COALESCE($7, institution),
        similarity_tags = COALESCE($8, similarity_tags),
        study_notes = COALESCE($9, study_notes),
        outcome = COALESCE($10, outcome),
        follow_up_required = COALESCE($11, follow_up_required)
       WHERE id = $12 RETURNING *`,
      [modality, body_part, study_date, diagnosis, findings, radiologist_name, institution, similarity_tags, study_notes, outcome, follow_up_required, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating study:', err);
    res.status(500).json({ error: 'Failed to update study' });
  }
});

// DELETE /api/studies/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM prior_studies WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Study not found' });
    }

    res.json({ message: 'Study deleted successfully', study: result.rows[0] });
  } catch (err) {
    console.error('Error deleting study:', err);
    res.status(500).json({ error: 'Failed to delete study' });
  }
});

// POST /api/studies/search - Advanced search with filters
router.post('/search', async (req, res) => {
  try {
    const { modality, body_part, diagnosis, date_from, date_to, institution, similarity_tags } = req.body;

    let query = `
      SELECT ps.*, p.name as patient_name, p.patient_id as patient_code
      FROM prior_studies ps
      LEFT JOIN patients p ON ps.patient_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (modality) {
      params.push(modality);
      query += ` AND ps.modality = $${params.length}`;
    }
    if (body_part) {
      params.push(`%${body_part}%`);
      query += ` AND ps.body_part ILIKE $${params.length}`;
    }
    if (diagnosis) {
      params.push(`%${diagnosis}%`);
      query += ` AND ps.diagnosis ILIKE $${params.length}`;
    }
    if (date_from) {
      params.push(date_from);
      query += ` AND ps.study_date >= $${params.length}`;
    }
    if (date_to) {
      params.push(date_to);
      query += ` AND ps.study_date <= $${params.length}`;
    }
    if (institution) {
      params.push(`%${institution}%`);
      query += ` AND ps.institution ILIKE $${params.length}`;
    }
    if (similarity_tags && similarity_tags.length > 0) {
      params.push(similarity_tags);
      query += ` AND ps.similarity_tags && $${params.length}`;
    }

    query += ' ORDER BY ps.study_date DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({
      studies: result.rows,
      total: result.rows.length,
    });
  } catch (err) {
    console.error('Error searching studies:', err);
    res.status(500).json({ error: 'Failed to search studies' });
  }
});

module.exports = router;
