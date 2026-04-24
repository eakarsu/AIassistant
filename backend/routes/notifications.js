const express = require('express');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
      [userId]
    );

    res.json({ unread_count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `UPDATE notifications SET read = true, updated_at = NOW()
       WHERE user_id = $1 AND read = false`,
      [userId]
    );

    res.json({ message: 'All notifications marked as read', count: result.rowCount });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { read, type, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM notifications';
    const params = [];
    const conditions = [];

    params.push(userId);
    conditions.push(`user_id = $${params.length}`);

    if (read !== undefined) {
      params.push(read === 'true');
      conditions.push(`read = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY created_at DESC';
    params.push(parseInt(limit, 10));
    query += ` LIMIT $${params.length}`;
    params.push(parseInt(offset, 10));
    query += ` OFFSET $${params.length}`;

    const result = await pool.query(query, params);

    const countQuery = `SELECT COUNT(*) FROM notifications WHERE ${conditions.join(' AND ')}`;
    const countParams = params.slice(0, params.length - 2);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      notifications: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE notifications SET read = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// POST /api/notifications
router.post('/', async (req, res) => {
  try {
    const { user_id, type, title, message } = req.body;

    if (!user_id || !title || !message) {
      return res.status(400).json({ error: 'user_id, title, and message are required' });
    }

    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, read)
       VALUES ($1, $2, $3, $4, false) RETURNING *`,
      [user_id, type || 'info', title, message]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating notification:', err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully', notification: result.rows[0] });
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
