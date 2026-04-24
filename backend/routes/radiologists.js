const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/radiologists
router.get('/', async (req, res) => {
  try {
    const { search, specialization, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM radiologists';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR employee_id ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (specialization) {
      params.push(`%${specialization}%`);
      conditions.push(`specialization ILIKE $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY name ASC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM radiologists WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM radiologists';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      radiologists: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching radiologists:', err);
    res.status(500).json({ error: 'Failed to fetch radiologists' });
  }
});

// GET /api/radiologists/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM radiologists WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching radiologist:', err);
    res.status(500).json({ error: 'Failed to fetch radiologist' });
  }
});

// POST /api/radiologists
router.post('/', async (req, res) => {
  try {
    const {
      employee_id, name, email, specialization, license_number,
      years_experience, phone, department, status, certifications
    } = req.body;

    if (!employee_id || !name || !email || !specialization || !license_number || years_experience === undefined) {
      return res.status(400).json({ error: 'employee_id, name, email, specialization, license_number, and years_experience are required' });
    }

    const result = await pool.query(
      `INSERT INTO radiologists (employee_id, name, email, specialization, license_number, years_experience, phone, department, status, certifications)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [employee_id, name, email, specialization, license_number, years_experience, phone, department, status || 'active', certifications]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Radiologist with this employee ID, email, or license number already exists' });
    }
    console.error('Error creating radiologist:', err);
    res.status(500).json({ error: 'Failed to create radiologist' });
  }
});

// PUT /api/radiologists/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, specialization, license_number,
      years_experience, phone, department, status, certifications
    } = req.body;

    const result = await pool.query(
      `UPDATE radiologists SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        specialization = COALESCE($3, specialization),
        license_number = COALESCE($4, license_number),
        years_experience = COALESCE($5, years_experience),
        phone = COALESCE($6, phone),
        department = COALESCE($7, department),
        status = COALESCE($8, status),
        certifications = COALESCE($9, certifications),
        updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [name, email, specialization, license_number, years_experience, phone, department, status, certifications, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating radiologist:', err);
    res.status(500).json({ error: 'Failed to update radiologist' });
  }
});

// DELETE /api/radiologists/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM radiologists WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Radiologist not found' });
    }

    res.json({ message: 'Radiologist deleted successfully', radiologist: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete radiologist with associated records' });
    }
    console.error('Error deleting radiologist:', err);
    res.status(500).json({ error: 'Failed to delete radiologist' });
  }
});

module.exports = router;
