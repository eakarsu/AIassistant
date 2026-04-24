const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/departments
router.get('/', async (req, res) => {
  try {
    const { search, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM departments';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR department_id ILIKE $${params.length})`);
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
      ? `SELECT COUNT(*) FROM departments WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM departments';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      departments: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching departments:', err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// GET /api/departments/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM departments WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching department:', err);
    res.status(500).json({ error: 'Failed to fetch department' });
  }
});

// POST /api/departments
router.post('/', async (req, res) => {
  try {
    const {
      department_id, name, description, head_radiologist_id,
      location, phone, email, status
    } = req.body;

    if (!department_id || !name) {
      return res.status(400).json({ error: 'department_id and name are required' });
    }

    const result = await pool.query(
      `INSERT INTO departments (department_id, name, description, head_radiologist_id, location, phone, email, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [department_id, name, description, head_radiologist_id, location, phone, email, status || 'active']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Department with this ID already exists' });
    }
    console.error('Error creating department:', err);
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// PUT /api/departments/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, head_radiologist_id,
      location, phone, email, status
    } = req.body;

    const result = await pool.query(
      `UPDATE departments SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        head_radiologist_id = COALESCE($3, head_radiologist_id),
        location = COALESCE($4, location),
        phone = COALESCE($5, phone),
        email = COALESCE($6, email),
        status = COALESCE($7, status),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, description, head_radiologist_id, location, phone, email, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating department:', err);
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({ message: 'Department deleted successfully', department: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete department with associated records' });
    }
    console.error('Error deleting department:', err);
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

module.exports = router;
