const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/images/stats
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT modality, COUNT(*) as count
      FROM radiology_images
      GROUP BY modality
      ORDER BY count DESC
    `);

    const totalResult = await pool.query('SELECT COUNT(*) FROM radiology_images');

    res.json({
      total: parseInt(totalResult.rows[0].count, 10),
      by_modality: result.rows.map(row => ({
        modality: row.modality,
        count: parseInt(row.count, 10),
      })),
    });
  } catch (err) {
    console.error('Error fetching image stats:', err);
    res.status(500).json({ error: 'Failed to fetch image statistics' });
  }
});

// GET /api/images
router.get('/', async (req, res) => {
  try {
    const { modality, status, patient_id, body_part, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT ri.*, p.name as patient_name, p.patient_id as patient_code
      FROM radiology_images ri
      LEFT JOIN patients p ON ri.patient_id = p.id
    `;
    const params = [];
    const conditions = [];

    if (modality) {
      params.push(modality);
      conditions.push(`ri.modality = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`ri.status = $${params.length}`);
    }
    if (patient_id) {
      params.push(parseInt(patient_id, 10));
      conditions.push(`ri.patient_id = $${params.length}`);
    }
    if (body_part) {
      params.push(`%${body_part}%`);
      conditions.push(`ri.body_part ILIKE $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY ri.acquisition_date DESC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM radiology_images ri WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM radiology_images';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      images: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching images:', err);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// GET /api/images/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT ri.*, p.name as patient_name, p.patient_id as patient_code
      FROM radiology_images ri
      LEFT JOIN patients p ON ri.patient_id = p.id
      WHERE ri.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching image:', err);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

// POST /api/images
router.post('/', async (req, res) => {
  try {
    const {
      image_id, patient_id, modality, body_part, description,
      acquisition_date, dicom_status, pacs_location, file_size,
      referring_physician, clinical_indication, status
    } = req.body;

    if (!image_id || !modality || !body_part || !acquisition_date) {
      return res.status(400).json({ error: 'image_id, modality, body_part, and acquisition_date are required' });
    }

    const result = await pool.query(
      `INSERT INTO radiology_images (image_id, patient_id, modality, body_part, description, acquisition_date, dicom_status, pacs_location, file_size, referring_physician, clinical_indication, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [image_id, patient_id, modality, body_part, description, acquisition_date, dicom_status || 'stored', pacs_location, file_size, referring_physician, clinical_indication, status || 'pending']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Image with this ID already exists' });
    }
    console.error('Error creating image:', err);
    res.status(500).json({ error: 'Failed to create image' });
  }
});

// PUT /api/images/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      modality, body_part, description, acquisition_date,
      dicom_status, pacs_location, file_size, referring_physician,
      clinical_indication, status
    } = req.body;

    const result = await pool.query(
      `UPDATE radiology_images SET
        modality = COALESCE($1, modality),
        body_part = COALESCE($2, body_part),
        description = COALESCE($3, description),
        acquisition_date = COALESCE($4, acquisition_date),
        dicom_status = COALESCE($5, dicom_status),
        pacs_location = COALESCE($6, pacs_location),
        file_size = COALESCE($7, file_size),
        referring_physician = COALESCE($8, referring_physician),
        clinical_indication = COALESCE($9, clinical_indication),
        status = COALESCE($10, status),
        updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [modality, body_part, description, acquisition_date, dicom_status, pacs_location, file_size, referring_physician, clinical_indication, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating image:', err);
    res.status(500).json({ error: 'Failed to update image' });
  }
});

// DELETE /api/images/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM radiology_images WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.json({ message: 'Image deleted successfully', image: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete image with associated analyses or reports' });
    }
    console.error('Error deleting image:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// POST /api/images/:id/de-identify
router.post('/:id/de-identify', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE radiology_images SET de_identified = true, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (result.rows[0].de_identified) {
      res.json({ message: 'Image marked as de-identified', image: result.rows[0] });
    }
  } catch (err) {
    console.error('Error de-identifying image:', err);
    res.status(500).json({ error: 'Failed to de-identify image' });
  }
});

module.exports = router;
