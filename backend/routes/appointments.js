const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/appointments/today
router.get('/today', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*,
        p.name as patient_name, p.patient_id as patient_code,
        r.name as radiologist_name, r.employee_id as radiologist_code
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN radiologists r ON a.radiologist_id = r.id
      WHERE DATE(a.scheduled_date) = CURRENT_DATE
      ORDER BY a.scheduled_date ASC
    `);

    res.json({
      appointments: result.rows,
      total: result.rows.length,
    });
  } catch (err) {
    console.error('Error fetching today\'s appointments:', err);
    res.status(500).json({ error: 'Failed to fetch today\'s appointments' });
  }
});

// GET /api/appointments
router.get('/', async (req, res) => {
  try {
    const { search, status, priority, modality, date_from, date_to, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT a.*,
        p.name as patient_name, p.patient_id as patient_code,
        r.name as radiologist_name, r.employee_id as radiologist_code
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN radiologists r ON a.radiologist_id = r.id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.appointment_id ILIKE $${params.length} OR a.room ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (priority) {
      params.push(priority);
      conditions.push(`a.priority = $${params.length}`);
    }
    if (modality) {
      params.push(modality);
      conditions.push(`a.modality = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`a.scheduled_date >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`a.scheduled_date <= $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.scheduled_date DESC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM appointments a WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM appointments';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      appointments: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// GET /api/appointments/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT a.*,
        p.name as patient_name, p.patient_id as patient_code,
        r.name as radiologist_name, r.employee_id as radiologist_code
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN radiologists r ON a.radiologist_id = r.id
      WHERE a.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching appointment:', err);
    res.status(500).json({ error: 'Failed to fetch appointment' });
  }
});

// POST /api/appointments
router.post('/', async (req, res) => {
  try {
    const {
      appointment_id, patient_id, radiologist_id, referring_physician_id,
      modality, body_part, scheduled_date, duration_minutes,
      status, priority, room, notes
    } = req.body;

    if (!appointment_id || !patient_id || !scheduled_date || !modality) {
      return res.status(400).json({ error: 'appointment_id, patient_id, scheduled_date, and modality are required' });
    }

    const result = await pool.query(
      `INSERT INTO appointments (appointment_id, patient_id, radiologist_id, referring_physician_id, modality, body_part, scheduled_date, duration_minutes, status, priority, room, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [appointment_id, patient_id, radiologist_id, referring_physician_id, modality, body_part, scheduled_date, duration_minutes || 30, status || 'scheduled', priority || 'routine', room, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Appointment with this ID already exists' });
    }
    console.error('Error creating appointment:', err);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// PUT /api/appointments/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      patient_id, radiologist_id, referring_physician_id,
      modality, body_part, scheduled_date, duration_minutes,
      status, priority, room, notes
    } = req.body;

    const result = await pool.query(
      `UPDATE appointments SET
        patient_id = COALESCE($1, patient_id),
        radiologist_id = COALESCE($2, radiologist_id),
        referring_physician_id = COALESCE($3, referring_physician_id),
        modality = COALESCE($4, modality),
        body_part = COALESCE($5, body_part),
        scheduled_date = COALESCE($6, scheduled_date),
        duration_minutes = COALESCE($7, duration_minutes),
        status = COALESCE($8, status),
        priority = COALESCE($9, priority),
        room = COALESCE($10, room),
        notes = COALESCE($11, notes),
        updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [patient_id, radiologist_id, referring_physician_id, modality, body_part, scheduled_date, duration_minutes, status, priority, room, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating appointment:', err);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// PUT /api/appointments/:id/status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validStatuses = ['scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE appointments SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating appointment status:', err);
    res.status(500).json({ error: 'Failed to update appointment status' });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM appointments WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json({ message: 'Appointment deleted successfully', appointment: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete appointment with associated records' });
    }
    console.error('Error deleting appointment:', err);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

module.exports = router;
