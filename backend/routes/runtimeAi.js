'use strict';
const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

router.post('/radiology-advice', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || !Object.keys(req.body).length) return res.status(400).json({ error: 'deidentified_context_required' });
    const serialized = JSON.stringify(req.body);
    if (/patient[_ -]?name|date[_ -]?of[_ -]?birth|medical[_ -]?record|\bmrn\b/i.test(serialized)) return res.status(400).json({ error: 'potential_phi_rejected' });
    const { OPENROUTER_API_KEY: key, OPENROUTER_MODEL: model, OPENROUTER_BASE_URL: base } = process.env;
    if (base !== 'https://openrouter.ai/api/v1' || !key || !model) throw new Error('OpenRouter runtime configuration is incomplete');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [
        { role: 'system', content: 'Provide a concise radiology review checklist for deidentified data. Do not diagnose or replace clinician judgment.' },
        { role: 'user', content: serialized },
      ] }),
    });
    if (!response.ok) throw new Error(`OpenRouter request failed with status ${response.status}`);
    const body = await response.json();
    const result = body.choices?.[0]?.message?.content;
    if (!result) throw new Error('OpenRouter returned no usable content');
    const saved = await pool.query(
      `INSERT INTO ai_results(feature,user_id,prompt_summary,result,model)
       VALUES('runtime_radiology_advice',$1,$2,$3::jsonb,$4) RETURNING id,created_at`,
      [req.user.id, 'deidentified radiology review checklist', JSON.stringify({ text: result }), body.model || model],
    );
    return res.json({ success: true, result, model: body.model || model, persisted: saved.rows[0] });
  } catch (error) {
    console.error('Runtime AI error:', error.message);
    return res.status(502).json({ error: 'provider_request_failed' });
  }
});

module.exports = router;
