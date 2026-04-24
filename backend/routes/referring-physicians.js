const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/referring-physicians
router.get('/', async (req, res) => {
  try {
    const { search, status, specialty, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM referring_physicians';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR physician_id ILIKE $${params.length} OR specialty ILIKE $${params.length} OR institution ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (specialty) {
      params.push(`%${specialty}%`);
      conditions.push(`specialty ILIKE $${params.length}`);
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
      ? `SELECT COUNT(*) FROM referring_physicians WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM referring_physicians';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      referring_physicians: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching referring physicians:', err);
    res.status(500).json({ error: 'Failed to fetch referring physicians' });
  }
});

// GET /api/referring-physicians/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM referring_physicians WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Referring physician not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching referring physician:', err);
    res.status(500).json({ error: 'Failed to fetch referring physician' });
  }
});

// POST /api/referring-physicians
router.post('/', async (req, res) => {
  try {
    const {
      physician_id, name, email, phone, fax, specialty,
      institution, address, npi_number, status, notes
    } = req.body;

    if (!physician_id || !name) {
      return res.status(400).json({ error: 'physician_id and name are required' });
    }

    const result = await pool.query(
      `INSERT INTO referring_physicians (physician_id, name, email, phone, fax, specialty, institution, address, npi_number, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [physician_id, name, email, phone, fax, specialty, institution, address, npi_number, status || 'active', notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Referring physician with this ID or NPI number already exists' });
    }
    console.error('Error creating referring physician:', err);
    res.status(500).json({ error: 'Failed to create referring physician' });
  }
});

// PUT /api/referring-physicians/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, email, phone, fax, specialty,
      institution, address, npi_number, status, notes
    } = req.body;

    const result = await pool.query(
      `UPDATE referring_physicians SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        fax = COALESCE($4, fax),
        specialty = COALESCE($5, specialty),
        institution = COALESCE($6, institution),
        address = COALESCE($7, address),
        npi_number = COALESCE($8, npi_number),
        status = COALESCE($9, status),
        notes = COALESCE($10, notes),
        updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [name, email, phone, fax, specialty, institution, address, npi_number, status, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Referring physician not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating referring physician:', err);
    res.status(500).json({ error: 'Failed to update referring physician' });
  }
});

// DELETE /api/referring-physicians/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM referring_physicians WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Referring physician not found' });
    }

    res.json({ message: 'Referring physician deleted successfully', referring_physician: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete referring physician with associated records' });
    }
    console.error('Error deleting referring physician:', err);
    res.status(500).json({ error: 'Failed to delete referring physician' });
  }
});

module.exports = router;
