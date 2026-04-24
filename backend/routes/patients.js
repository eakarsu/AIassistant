const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/patients
router.get('/', async (req, res) => {
  try {
    const { search, gender, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM patients';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR patient_id ILIKE $${params.length} OR medical_record_number ILIKE $${params.length})`);
    }
    if (gender) {
      params.push(gender);
      conditions.push(`gender = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM patients WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM patients';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      patients: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// GET /api/patients/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM patients WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching patient:', err);
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

// POST /api/patients
router.post('/', async (req, res) => {
  try {
    const {
      patient_id, name, date_of_birth, gender, medical_record_number,
      phone, email, address, insurance_provider, insurance_id,
      allergies, medical_history
    } = req.body;

    if (!patient_id || !name || !date_of_birth || !gender || !medical_record_number) {
      return res.status(400).json({ error: 'patient_id, name, date_of_birth, gender, and medical_record_number are required' });
    }

    const result = await pool.query(
      `INSERT INTO patients (patient_id, name, date_of_birth, gender, medical_record_number, phone, email, address, insurance_provider, insurance_id, allergies, medical_history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [patient_id, name, date_of_birth, gender, medical_record_number, phone, email, address, insurance_provider, insurance_id, allergies, medical_history]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Patient with this ID or MRN already exists' });
    }
    console.error('Error creating patient:', err);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

// PUT /api/patients/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, date_of_birth, gender, phone, email, address,
      insurance_provider, insurance_id, allergies, medical_history
    } = req.body;

    const result = await pool.query(
      `UPDATE patients SET
        name = COALESCE($1, name),
        date_of_birth = COALESCE($2, date_of_birth),
        gender = COALESCE($3, gender),
        phone = COALESCE($4, phone),
        email = COALESCE($5, email),
        address = COALESCE($6, address),
        insurance_provider = COALESCE($7, insurance_provider),
        insurance_id = COALESCE($8, insurance_id),
        allergies = COALESCE($9, allergies),
        medical_history = COALESCE($10, medical_history),
        updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [name, date_of_birth, gender, phone, email, address, insurance_provider, insurance_id, allergies, medical_history, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating patient:', err);
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

// DELETE /api/patients/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM patients WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    res.json({ message: 'Patient deleted successfully', patient: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete patient with associated records' });
    }
    console.error('Error deleting patient:', err);
    res.status(500).json({ error: 'Failed to delete patient' });
  }
});

module.exports = router;
