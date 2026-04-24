const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/billing/stats
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0) as total_billed,
        COALESCE(SUM(insurance_paid), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as total_pending,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END), 0) as total_overdue
      FROM billing
    `);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching billing stats:', err);
    res.status(500).json({ error: 'Failed to fetch billing stats' });
  }
});

// GET /api/billing
router.get('/', async (req, res) => {
  try {
    const { search, status, date_from, date_to, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT b.*,
        p.name as patient_name, p.patient_id as patient_code
      FROM billing b
      LEFT JOIN patients p ON b.patient_id = p.id
    `;
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(b.invoice_id ILIKE $${params.length} OR b.procedure_code ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`b.billing_date >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`b.billing_date <= $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY b.billing_date DESC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = conditions.length > 0
      ? `SELECT COUNT(*) FROM billing b WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM billing';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      invoices: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching billing records:', err);
    res.status(500).json({ error: 'Failed to fetch billing records' });
  }
});

// GET /api/billing/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT b.*,
        p.name as patient_name, p.patient_id as patient_code
      FROM billing b
      LEFT JOIN patients p ON b.patient_id = p.id
      WHERE b.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Billing record not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching billing record:', err);
    res.status(500).json({ error: 'Failed to fetch billing record' });
  }
});

// POST /api/billing
router.post('/', async (req, res) => {
  try {
    const {
      invoice_id, patient_id, appointment_id, report_id,
      procedure_code, description, amount, insurance_billed,
      insurance_paid, patient_balance, status, billing_date,
      due_date, paid_date, notes
    } = req.body;

    if (!invoice_id || !patient_id || !amount) {
      return res.status(400).json({ error: 'invoice_id, patient_id, and amount are required' });
    }

    const result = await pool.query(
      `INSERT INTO billing (invoice_id, patient_id, appointment_id, report_id, procedure_code, description, amount, insurance_billed, insurance_paid, patient_balance, status, billing_date, due_date, paid_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [invoice_id, patient_id, appointment_id, report_id, procedure_code, description, amount, insurance_billed || 0, insurance_paid || 0, patient_balance || amount, status || 'pending', billing_date || new Date(), due_date, paid_date, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Billing record with this invoice ID already exists' });
    }
    console.error('Error creating billing record:', err);
    res.status(500).json({ error: 'Failed to create billing record' });
  }
});

// PUT /api/billing/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      procedure_code, description, amount, insurance_billed,
      insurance_paid, patient_balance, status, billing_date,
      due_date, paid_date, notes
    } = req.body;

    const result = await pool.query(
      `UPDATE billing SET
        procedure_code = COALESCE($1, procedure_code),
        description = COALESCE($2, description),
        amount = COALESCE($3, amount),
        insurance_billed = COALESCE($4, insurance_billed),
        insurance_paid = COALESCE($5, insurance_paid),
        patient_balance = COALESCE($6, patient_balance),
        status = COALESCE($7, status),
        billing_date = COALESCE($8, billing_date),
        due_date = COALESCE($9, due_date),
        paid_date = COALESCE($10, paid_date),
        notes = COALESCE($11, notes),
        updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [procedure_code, description, amount, insurance_billed, insurance_paid, patient_balance, status, billing_date, due_date, paid_date, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Billing record not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating billing record:', err);
    res.status(500).json({ error: 'Failed to update billing record' });
  }
});

// PUT /api/billing/:id/pay
router.put('/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE billing SET
        status = 'paid',
        paid_date = NOW(),
        patient_balance = 0,
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Billing record not found' });
    }

    res.json({ message: 'Billing record marked as paid', invoice: result.rows[0] });
  } catch (err) {
    console.error('Error marking billing record as paid:', err);
    res.status(500).json({ error: 'Failed to mark billing record as paid' });
  }
});

// DELETE /api/billing/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM billing WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Billing record not found' });
    }

    res.json({ message: 'Billing record deleted successfully', invoice: result.rows[0] });
  } catch (err) {
    console.error('Error deleting billing record:', err);
    res.status(500).json({ error: 'Failed to delete billing record' });
  }
});

module.exports = router;
