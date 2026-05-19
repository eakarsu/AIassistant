// routes/customViews.js — Assistant Views: 2 VIZ + 2 NON-VIZ custom features.
// This module is hosted inside the "AIassistant" project (which is actually a
// radiology platform per seed data), so the synthesized payloads use the
// vocabulary the platform already speaks (studies, modalities, intents) and
// also frame each study as a "conversation" of turns between requester and
// the AI assistant — preserving both metaphors.
//
// Endpoints (mounted at /api/custom-views):
//   GET    /conversation-timeline           VIZ 1
//   GET    /intent-heatmap                  VIZ 2
//   GET    /transcript-pdf                  NON-VIZ 1 (binary PDF)
//   GET    /prompt-templates                NON-VIZ 2 (CRUD - list)
//   POST   /prompt-templates                NON-VIZ 2 (CRUD - create)
//   PUT    /prompt-templates/:id            NON-VIZ 2 (CRUD - update)
//   DELETE /prompt-templates/:id            NON-VIZ 2 (CRUD - delete)
//
// Notes:
//   * No new dependencies — pdfkit and express-rate-limit are already in
//     backend/package.json.
//   * In-memory data store is deterministic across boots via a seeded RNG.
//   * Rate limiter uses ipKeyGenerator when available (v7+ guidance).

const express = require('express');
const PDFDocument = require('pdfkit');

let rateLimit = null;
let ipKeyGenerator = (ip) => ip;
try {
  const erl = require('express-rate-limit');
  rateLimit = erl.rateLimit || erl;
  if (typeof erl.ipKeyGenerator === 'function') ipKeyGenerator = erl.ipKeyGenerator;
} catch (_) {
  // Optional dependency — fall back to a no-op limiter if absent.
}

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Deterministic seeded RNG so payloads are stable across boots / tests.
// ──────────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260518);

const INTENTS = [
  'study-summary', 'finding-extract', 'prior-compare', 'critical-flag',
  'protocol-suggest', 'transcribe', 'translate', 'patient-explain',
  'billing-code', 'qa-review', 'small-talk',
];

const MODALITIES = ['CT', 'MR', 'XR', 'US', 'MG', 'NM'];
const BODY_PARTS = [
  'chest', 'abdomen', 'pelvis', 'head', 'cervical-spine', 'lumbar-spine',
  'knee', 'shoulder', 'liver', 'kidneys', 'breast', 'thyroid',
  'mediastinum', 'sinuses', 'wrist', 'foot',
];

const MODELS = [
  'anthropic/claude-haiku-4.5',
  'openai/gpt-4o-mini',
  'anthropic/claude-3-5-sonnet',
];

// 24 synthetic conversations / studies with 5-12 turns each.
function buildConversations() {
  const out = [];
  let convId = 1000;
  let turnId = 1;
  const now = Date.now();
  for (let i = 0; i < 24; i++) {
    const modality = MODALITIES[i % MODALITIES.length];
    const bodyPart = BODY_PARTS[i % BODY_PARTS.length];
    const topic = `${modality} ${bodyPart}`;
    const startedAt = now - (i * 6 + 2) * 3600 * 1000;
    const turnCount = 5 + (i % 8);
    const model = MODELS[i % MODELS.length];
    const turns = [];
    for (let t = 0; t < turnCount; t++) {
      const intent = INTENTS[(i + t) % INTENTS.length];
      const isUser = t % 2 === 0;
      const at = startedAt + t * (45 + (t * 7) % 180) * 1000;
      turns.push({
        id: turnId++,
        role: isUser ? 'user' : 'assistant',
        intent,
        latency_ms: isUser ? 0 : 400 + Math.floor(rand() * 2400),
        token_count: 18 + Math.floor(rand() * 220),
        content: isUser
          ? `(user) review the ${topic} study — pass ${t + 1}`
          : `(assistant) On the ${topic} study, pass ${t + 1}: I see ${
              ['no acute findings', 'a small nodule', 'mild effusion', 'stable appearance', 'a new lesion'][Math.floor(rand() * 5)]
            }. Recommend ${
              ['follow-up in 6mo', 'no further imaging', 'comparison with priors', 'specialist referral'][Math.floor(rand() * 4)]
            }.`,
        created_at: new Date(at).toISOString(),
      });
    }
    out.push({
      id: convId++,
      title: `${topic} · accession #${100000 + i}`,
      topic,
      modality,
      body_part: bodyPart,
      model,
      started_at: new Date(startedAt).toISOString(),
      turn_count: turnCount,
      turns,
    });
  }
  return out;
}

const CONVERSATIONS = buildConversations();
const CONV_BY_ID = new Map(CONVERSATIONS.map((c) => [c.id, c]));

// Prompt templates — in-memory CRUD store, seeded with radiology-flavoured
// presets that still work for any general AI-assistant audience.
let TEMPLATE_SEQ = 4;
const PROMPT_TEMPLATES = [
  {
    id: 1,
    name: 'study-summary',
    description: 'Summarize a radiology study in 3 bullets.',
    body: 'You are an expert radiologist. Summarize the following {{modality}} {{body_part}} study in exactly 3 bullets focused on actionable findings.\n\nFindings: {{findings}}',
    variables: ['modality', 'body_part', 'findings'],
    tags: 'summary,radiology',
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    name: 'code-reviewer',
    description: 'Review code for bugs and clarity.',
    body: 'You are a senior engineer. Review the {{language}} code below for correctness, performance, and clarity. Return findings as a numbered list.\n\n```{{language}}\n{{code}}\n```',
    variables: ['language', 'code'],
    tags: 'code,review',
    updated_at: new Date().toISOString(),
  },
  {
    id: 3,
    name: 'patient-explain',
    description: 'Translate findings to plain English for a patient.',
    body: 'Rewrite the radiology findings below in plain English suitable for a non-medical patient at a 6th-grade reading level. Avoid jargon; keep it under 120 words.\n\nFindings: {{findings}}',
    variables: ['findings'],
    tags: 'communication,patient',
    updated_at: new Date().toISOString(),
  },
  {
    id: 4,
    name: 'meeting-notes',
    description: 'Turn raw notes into structured minutes.',
    body: 'Transform the raw meeting notes below into structured minutes with sections: Attendees, Decisions, Action Items (assignee + due date), Open Questions.\n\nNotes: {{notes}}',
    variables: ['notes'],
    tags: 'productivity,meetings',
    updated_at: new Date().toISOString(),
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Optional rate limiter for the CRUD write endpoints. Keeps the limiter
// scoped (auth user → ip fallback) and uses ipKeyGenerator for IPv6 safety.
// ──────────────────────────────────────────────────────────────────────────
const writeLimiter = rateLimit
  ? rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => (req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip)),
    })
  : (req, res, next) => next();

// ──────────────────────────────────────────────────────────────────────────
// VIZ 1 — Conversation/Study timeline
// GET /api/custom-views/conversation-timeline?limit=12
// Returns a flat, time-ordered series of turns + per-conversation lanes.
// ──────────────────────────────────────────────────────────────────────────
router.get('/conversation-timeline', (req, res) => {
  try {
    const limit = Math.min(24, Math.max(3, parseInt(req.query.limit, 10) || 12));
    const convs = CONVERSATIONS.slice(0, limit);
    const lanes = convs.map((c) => ({
      id: c.id,
      title: c.title,
      topic: c.topic,
      modality: c.modality,
      body_part: c.body_part,
      model: c.model,
      started_at: c.started_at,
      turn_count: c.turn_count,
    }));
    const events = [];
    for (const c of convs) {
      for (const t of c.turns) {
        events.push({
          conv_id: c.id,
          turn_id: t.id,
          role: t.role,
          intent: t.intent,
          at: t.created_at,
          latency_ms: t.latency_ms,
          tokens: t.token_count,
          preview: String(t.content).slice(0, 100),
        });
      }
    }
    events.sort((a, b) => new Date(a.at) - new Date(b.at));
    const minT = events.length ? new Date(events[0].at).getTime() : Date.now();
    const maxT = events.length ? new Date(events[events.length - 1].at).getTime() : Date.now() + 1;
    res.json({
      lanes,
      events,
      window: { start: new Date(minT).toISOString(), end: new Date(maxT).toISOString() },
      total_conversations: lanes.length,
      total_turns: events.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// VIZ 2 — Intent × hour-of-day heatmap.
// GET /api/custom-views/intent-heatmap
// ──────────────────────────────────────────────────────────────────────────
router.get('/intent-heatmap', (req, res) => {
  try {
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const matrix = INTENTS.map((intent) => ({
      intent,
      counts: hours.map(() => 0),
    }));
    let maxCount = 0;
    let total = 0;
    for (const c of CONVERSATIONS) {
      for (const t of c.turns) {
        const h = new Date(t.created_at).getHours();
        const row = matrix.find((m) => m.intent === t.intent);
        if (!row) continue;
        row.counts[h] += 1;
        total += 1;
        if (row.counts[h] > maxCount) maxCount = row.counts[h];
      }
    }
    const top = matrix
      .map((m) => ({ intent: m.intent, total: m.counts.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    res.json({
      hours,
      intents: INTENTS,
      matrix,
      max_count: maxCount,
      total_turns: total,
      top_intents: top,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// NON-VIZ 1 — Conversation / study transcript PDF
// GET /api/custom-views/transcript-pdf?conv_id=1000
// Streams a styled PDF of the chosen conversation.
// ──────────────────────────────────────────────────────────────────────────
router.get('/transcript-pdf', (req, res) => {
  try {
    const convId = parseInt(req.query.conv_id, 10);
    const conv = CONV_BY_ID.get(convId) || CONVERSATIONS[0];
    if (!conv) return res.status(404).json({ error: 'conversation not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="conversation-${conv.id}.pdf"`);

    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
    doc.pipe(res);

    // Header
    doc.fillColor('#0f172a').fontSize(20).text('Assistant — Study Transcript', { align: 'left' });
    doc.moveDown(0.2);
    doc.fillColor('#475569').fontSize(10)
      .text(`ID: ${conv.id}  ·  Title: ${conv.title}`)
      .text(`Modality: ${conv.modality}  ·  Body Part: ${conv.body_part}`)
      .text(`Model: ${conv.model}  ·  Started: ${conv.started_at}`)
      .text(`Turns: ${conv.turn_count}`);
    doc.moveDown(0.5);
    doc.moveTo(48, doc.y).lineTo(564, doc.y).strokeColor('#cbd5e1').stroke();
    doc.moveDown(0.8);

    // Turns
    for (const t of conv.turns) {
      const isUser = t.role === 'user';
      doc.fillColor(isUser ? '#1d4ed8' : '#0f766e').fontSize(11)
        .text(`${isUser ? 'Requester' : 'Assistant'}  ·  intent=${t.intent}  ·  ${t.created_at}`);
      doc.fillColor('#0f172a').fontSize(11).text(t.content, { paragraphGap: 4 });
      doc.fillColor('#94a3b8').fontSize(9).text(
        `tokens=${t.token_count}${t.latency_ms ? `  latency=${t.latency_ms}ms` : ''}`,
        { paragraphGap: 8 }
      );
    }

    doc.moveDown(1);
    doc.fillColor('#94a3b8').fontSize(9)
      .text(`Exported ${new Date().toISOString()} via /api/custom-views/transcript-pdf`, { align: 'right' });

    doc.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// NON-VIZ 2 — Prompt template editor (in-memory CRUD)
// GET    /prompt-templates
// POST   /prompt-templates                  { name, description?, body, tags? }
// PUT    /prompt-templates/:id              { ...fields }
// DELETE /prompt-templates/:id
// ──────────────────────────────────────────────────────────────────────────
function extractVars(body) {
  const out = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(body || ''))) !== null) out.add(m[1]);
  return Array.from(out);
}

router.get('/prompt-templates', (req, res) => {
  res.json({ templates: PROMPT_TEMPLATES, count: PROMPT_TEMPLATES.length });
});

router.post('/prompt-templates', writeLimiter, (req, res) => {
  const { name, description, body, tags } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  if (!body || typeof body !== 'string') return res.status(400).json({ error: 'body is required' });
  if (PROMPT_TEMPLATES.some((t) => t.name === name.trim())) {
    return res.status(409).json({ error: 'a template with this name already exists' });
  }
  const tpl = {
    id: ++TEMPLATE_SEQ,
    name: name.trim(),
    description: description || '',
    body,
    variables: extractVars(body),
    tags: tags || '',
    updated_at: new Date().toISOString(),
  };
  PROMPT_TEMPLATES.push(tpl);
  res.status(201).json(tpl);
});

router.put('/prompt-templates/:id', writeLimiter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tpl = PROMPT_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return res.status(404).json({ error: 'template not found' });
  const { name, description, body, tags } = req.body || {};
  if (name && typeof name === 'string') tpl.name = name.trim();
  if (description !== undefined) tpl.description = description;
  if (body !== undefined) {
    tpl.body = body;
    tpl.variables = extractVars(body);
  }
  if (tags !== undefined) tpl.tags = tags;
  tpl.updated_at = new Date().toISOString();
  res.json(tpl);
});

router.delete('/prompt-templates/:id', writeLimiter, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = PROMPT_TEMPLATES.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'template not found' });
  const [removed] = PROMPT_TEMPLATES.splice(idx, 1);
  res.json({ ok: true, removed });
});

module.exports = router;
