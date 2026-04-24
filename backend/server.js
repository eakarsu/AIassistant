const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const radiologistRoutes = require('./routes/radiologists');
const imageRoutes = require('./routes/images');
const analysisRoutes = require('./routes/analysis');
const studyRoutes = require('./routes/studies');
const reportRoutes = require('./routes/reports');
const departmentRoutes = require('./routes/departments');
const referringPhysicianRoutes = require('./routes/referring-physicians');
const appointmentRoutes = require('./routes/appointments');
const billingRoutes = require('./routes/billing');
const auditRoutes = require('./routes/audit');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors({
  origin: `http://localhost:${process.env.FRONTEND_PORT || 3000}`,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Public routes
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const queries = [
      pool.query('SELECT COUNT(*) as count FROM patients'),
      pool.query('SELECT COUNT(*) as count FROM radiologists'),
      pool.query('SELECT COUNT(*) as count FROM radiology_images'),
      pool.query('SELECT COUNT(*) as count FROM ai_analyses'),
      pool.query('SELECT COUNT(*) as count FROM prior_studies'),
      pool.query('SELECT COUNT(*) as count FROM reports'),
      pool.query("SELECT COUNT(*) as count FROM radiology_images WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) as count FROM reports WHERE status = 'draft'"),
      pool.query("SELECT COUNT(*) as count FROM reports WHERE status = 'finalized'"),
      pool.query(`
        SELECT modality, COUNT(*) as count
        FROM radiology_images
        GROUP BY modality
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT status, COUNT(*) as count
        FROM reports
        GROUP BY status
        ORDER BY count DESC
      `),
      pool.query('SELECT COUNT(*) as count FROM departments'),
      pool.query('SELECT COUNT(*) as count FROM referring_physicians'),
      pool.query('SELECT COUNT(*) as count FROM appointments'),
      pool.query("SELECT COUNT(*) as count FROM appointments WHERE scheduled_date::date = CURRENT_DATE"),
      pool.query('SELECT COUNT(*) as count FROM billing'),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM billing"),
      pool.query('SELECT COUNT(*) as count FROM notifications WHERE read = false'),
    ];

    const results = await Promise.all(queries);

    res.json({
      patients: parseInt(results[0].rows[0].count, 10),
      radiologists: parseInt(results[1].rows[0].count, 10),
      images: parseInt(results[2].rows[0].count, 10),
      analyses: parseInt(results[3].rows[0].count, 10),
      studies: parseInt(results[4].rows[0].count, 10),
      reports: parseInt(results[5].rows[0].count, 10),
      pending_images: parseInt(results[6].rows[0].count, 10),
      draft_reports: parseInt(results[7].rows[0].count, 10),
      finalized_reports: parseInt(results[8].rows[0].count, 10),
      images_by_modality: results[9].rows.map(row => ({
        modality: row.modality,
        count: parseInt(row.count, 10),
      })),
      reports_by_status: results[10].rows.map(row => ({
        status: row.status,
        count: parseInt(row.count, 10),
      })),
      departments: parseInt(results[11].rows[0].count, 10),
      referring_physicians: parseInt(results[12].rows[0].count, 10),
      appointments: parseInt(results[13].rows[0].count, 10),
      todays_appointments: parseInt(results[14].rows[0].count, 10),
      invoices: parseInt(results[15].rows[0].count, 10),
      total_revenue: parseFloat(results[16].rows[0].total),
      unread_notifications: parseInt(results[17].rows[0].count, 10),
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Protected routes
app.use('/api/patients', authenticateToken, patientRoutes);
app.use('/api/radiologists', authenticateToken, radiologistRoutes);
app.use('/api/images', authenticateToken, imageRoutes);
app.use('/api/analyses', authenticateToken, analysisRoutes);
app.use('/api/studies', authenticateToken, studyRoutes);
app.use('/api/reports', authenticateToken, reportRoutes);
app.use('/api/departments', authenticateToken, departmentRoutes);
app.use('/api/referring-physicians', authenticateToken, referringPhysicianRoutes);
app.use('/api/appointments', authenticateToken, appointmentRoutes);
app.use('/api/billing', authenticateToken, billingRoutes);
app.use('/api/audit-logs', authenticateToken, auditRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/users', authenticateToken, userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Radiology AI Backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} in use, retrying in 2 seconds...`);
    setTimeout(() => {
      server.close();
      server.listen(PORT);
    }, 2000);
  } else {
    console.error('Server error:', err);
  }
});

// Graceful shutdown for nodemon/watch restarts
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

module.exports = app;
