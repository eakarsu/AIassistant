const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { validateRuntime } = require('./governance/runtime');
validateRuntime();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { authenticateToken } = require('./middleware/auth');
const { createProviderGate } = require('./governance/providerGate');
const pool = require('./db/pool');
const bcrypt = require('bcryptjs');

const app = express();
const port = Number(process.env.BACKEND_PORT || 3001);
const origins = String(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map((value) => value.trim()).filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' }, contentSecurityPolicy: false }));
app.use(cors({ origin(origin, callback) {
  if (!origin || origins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS.'));
}, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'AIassistant', timestamp: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/governance', require('./governance/router'));

app.use('/api', authenticateToken);
app.use('/api/runtime-ai', require('./routes/runtimeAi'));
const protectedRoutes = [
  ['/api/patients','./routes/patients'],['/api/radiologists','./routes/radiologists'],
  ['/api/images','./routes/images'],['/api/analyses','./routes/analysis'],
  ['/api/studies','./routes/studies'],['/api/reports','./routes/reports'],
  ['/api/departments','./routes/departments'],['/api/referring-physicians','./routes/referring-physicians'],
  ['/api/appointments','./routes/appointments'],['/api/billing','./routes/billing'],
  ['/api/audit-logs','./routes/audit'],['/api/notifications','./routes/notifications'],
  ['/api/users','./routes/users'],['/api/critical-findings-queue','./routes/criticalFindingsQueue'],
  ['/api/report-pdf','./routes/pdfReports']
];
for (const [mount, modulePath] of protectedRoutes) app.use(mount, require(modulePath));

const providerGate = createProviderGate(['/api/ai-analysis','/api/dicom-cad','/api/auto-report','/api/urgent-prioritize','/api/radiologist-metrics','/api/ehr-bridge','/api/custom-views','/api/gap','/api/extensions']);
app.use(providerGate);
if (process.env.ENABLE_LEGACY_PROVIDER_ROUTES === 'true' && process.env.NODE_ENV !== 'production') {
  app.use('/api/ai-analysis', require('./routes/aiAnalysis'));
  app.use('/api/extensions', require('./routes/extensions'));
  app.use('/api/custom-views', require('./routes/customViews'));
  app.use('/api/dicom-cad', require('./routes/dicomCad'));
  app.use('/api/auto-report', require('./routes/autoReport'));
  app.use('/api/urgent-prioritize', require('./routes/urgentPrioritize'));
  app.use('/api/radiologist-metrics', require('./routes/radiologistMetrics'));
  app.use('/api/ehr-bridge', require('./routes/ehrBridge'));
  const generatedRoutes = [
    ['gap-ai-image-analysis-computer-aided','gap_ai_image_analysis_computer_aided'],
    ['gap-ai-report-generation-transcribing-findings','gap_ai_report_generation_transcribing_findings'],
    ['gap-ai-study-quality-qa-flagging','gap_ai_study_quality_qa_flagging'],
    ['gap-ai-urgent-case-prioritization','gap_ai_urgent_case_prioritization'],
    ['gap-dicom-viewer-image-viewing-tool','gap_dicom_viewer_image_viewing_tool'],
    ['gap-ehr-integration-epic-cerner-hl7','gap_ehr_integration_epic_cerner_hl7'],
    ['gap-teleradiology-remote-reading-workflow','gap_teleradiology_remote_reading_workflow'],
    ['gap-outbound-webhooks','gap_outbound_webhooks'],
    ['gap-mobile-reading-app','gap_mobile_reading_app']
  ];
  for (const [mount, moduleName] of generatedRoutes) app.use(`/api/${mount}`, require(`./routes/${moduleName}`));
}

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' }));

async function ensureTestUser() {
  if (process.env.NODE_ENV !== 'test') return;
  const email = process.env.ADMIN_EMAIL || process.env.DEMO_EMAIL;
  const password = process.env.ADMIN_PASSWORD || process.env.DEMO_PASSWORD;
  if (!email || !password) throw new Error('Explicit test administrator credentials are required');
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY,email VARCHAR(255) UNIQUE NOT NULL,password VARCHAR(255) NOT NULL,name VARCHAR(255) NOT NULL,role VARCHAR(50) NOT NULL DEFAULT 'viewer',created_at TIMESTAMPTZ DEFAULT NOW())`);
  const hash = await bcrypt.hash(password, 10);
  await pool.query(`INSERT INTO users (email,password,name,role) VALUES ($1,$2,$3,'admin') ON CONFLICT (email) DO UPDATE SET password=EXCLUDED.password`, [email, hash, 'Runtime Administrator']);
}

async function start() {
  await ensureTestUser();
  return app.listen(port, () => console.log(`Grounded Assistant API listening on ${port}`));
}
if (require.main === module) start().catch((error) => { console.error('Startup failed:', error.message); process.exitCode = 1; });
module.exports = { app, start };
