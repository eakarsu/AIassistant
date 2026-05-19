const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const radiologistRoutes = require('./routes/radiologists');
const imageRoutes = require('./routes/images');
const analysisRoutes = require('./routes/analysis');
const aiAnalysisRoutes = require('./routes/aiAnalysis');
const pdfReportRoutes = require('./routes/pdfReports');
const studyRoutes = require('./routes/studies');
const reportRoutes = require('./routes/reports');
const departmentRoutes = require('./routes/departments');
const referringPhysicianRoutes = require('./routes/referring-physicians');
const appointmentRoutes = require('./routes/appointments');
const billingRoutes = require('./routes/billing');
const auditRoutes = require('./routes/audit');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
// Apply pass 5 — backlog extensions (DICOM registry, EHR, teleradiology)
const extensionsRoutes = require('./routes/extensions');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Build allowed CORS origins from env
const buildAllowedOrigins = () => {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  }
  if (process.env.FRONTEND_URL) return [process.env.FRONTEND_URL];
  const port = process.env.FRONTEND_PORT || 3000;
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
};
const ALLOWED_ORIGINS = buildAllowedOrigins();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// Middleware
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Best-effort runtime migration: ensure ai_results JSONB table exists.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_results (
        id SERIAL PRIMARY KEY,
        feature VARCHAR(100) NOT NULL,
        user_id INTEGER,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        prompt_summary TEXT,
        result JSONB NOT NULL DEFAULT '{}'::jsonb,
        model VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ai_results_feature ON ai_results (feature);
      CREATE INDEX IF NOT EXISTS idx_ai_results_user ON ai_results (user_id);
      CREATE INDEX IF NOT EXISTS idx_ai_results_entity ON ai_results (entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_ai_results_created ON ai_results (created_at DESC);
    `);
  } catch (err) {
    console.warn('[ai_results] runtime migration skipped:', err.message);
  }
})();

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

// AI analysis routes — auth handled per-route inside the router (stream is public)
app.use('/api/ai-analysis', aiAnalysisRoutes);

// PDF report generation route — GET /api/report-pdf/:analysis_id/pdf
app.use('/api/report-pdf', authenticateToken, pdfReportRoutes);

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
// Apply pass 5 — extensions (auth handled per-route inside the router)
app.use('/api', extensionsRoutes);

// === Custom Views (Assistant Views) — 2 viz + 2 non-viz ===
app.use('/api/custom-views', require('./routes/customViews'));

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
  console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
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

// BATCH_00_AUDIT_MOUNTS
app.use('/api/dicom-cad', require('./routes/dicomCad'));
app.use('/api/auto-report', require('./routes/autoReport'));
app.use('/api/urgent-prioritize', require('./routes/urgentPrioritize'));
app.use('/api/radiologist-metrics', require('./routes/radiologistMetrics'));
app.use('/api/ehr-bridge', require('./routes/ehrBridge'));

// === Batch 00 Gaps & Frontend Mounts ===
app.use('/api/gap-ai-image-analysis-computer-aided', require('./routes/gap_ai_image_analysis_computer_aided'));
app.use('/api/gap-ai-report-generation-transcribing-findings', require('./routes/gap_ai_report_generation_transcribing_findings'));
app.use('/api/gap-ai-study-quality-qa-flagging', require('./routes/gap_ai_study_quality_qa_flagging'));
app.use('/api/gap-ai-urgent-case-prioritization', require('./routes/gap_ai_urgent_case_prioritization'));
app.use('/api/gap-dicom-viewer-image-viewing-tool', require('./routes/gap_dicom_viewer_image_viewing_tool'));
app.use('/api/gap-ehr-integration-epic-cerner-hl7', require('./routes/gap_ehr_integration_epic_cerner_hl7'));
app.use('/api/gap-teleradiology-remote-reading-workflow', require('./routes/gap_teleradiology_remote_reading_workflow'));
app.use('/api/gap-outbound-webhooks', require('./routes/gap_outbound_webhooks'));
app.use('/api/gap-mobile-reading-app', require('./routes/gap_mobile_reading_app'));
