const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// Helper function to log audit entries
async function logAudit(pool, userId, userName, action, entityType, entityId, details) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, userName, action, entityType, entityId, details]
    );
  } catch (err) {
    console.error('Error logging audit entry:', err);
  }
}

// GET /api/audit/stats
router.get('/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT action, COUNT(*) as count
      FROM audit_logs
      GROUP BY action
      ORDER BY count DESC
    `);

    res.json({ stats: result.rows });
  } catch (err) {
    console.error('Error fetching audit stats:', err);
    res.status(500).json({ error: 'Failed to fetch audit stats' });
  }
});

// GET /api/audit
router.get('/', async (req, res) => {
  try {
    const { search, action, entity_type, date_from, date_to, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM audit_logs';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(user_name ILIKE $${params.length} OR action ILIKE $${params.length} OR entity_type ILIKE $${params.length} OR details ILIKE $${params.length})`);
    }
    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }
    if (entity_type) {
      params.push(entity_type);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`created_at <= $${params.length}`);
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
      ? `SELECT COUNT(*) FROM audit_logs WHERE ${conditions.join(' AND ')}`
      : 'SELECT COUNT(*) FROM audit_logs';
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      audit_logs: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching audit logs:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
module.exports.logAudit = logAudit;
