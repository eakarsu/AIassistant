const https = require('https');
const { parseAIJson } = require('../parseAIJson');

/**
 * OpenRouterService
 * Standard wrapper for calling OpenRouter API with anthropic/claude-3-5-sonnet-20241022.
 * All methods return parsed JSON when possible, or a structured fallback.
 */
class OpenRouterService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  /**
   * Make a standard (non-streaming) request to OpenRouter.
   * @param {Array} messages - Chat messages array [{role, content}]
   * @param {number} maxTokens - Max tokens (default 4096)
   * @returns {Promise<string>} Raw text content
   */
  _sanitize(value, maxLen = 8000) {
    if (value == null) return '';
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    const cleaned = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '...[truncated]' : cleaned;
  }

  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async _makeRequest(messages, maxTokens = 4096, retries = 2) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured in environment variables.');
    }

    // Sanitize user-role contents to prevent prompt-injection bombs.
    const safeMessages = messages.map((m) =>
      m.role === 'user' ? { ...m, content: this._sanitize(m.content) } : m
    );

    const body = JSON.stringify({
      model: this.model,
      messages: safeMessages,
      temperature: 0.3,
      max_tokens: maxTokens,
    });

    const doOnce = () => new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Radiology AI Assistant',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              const code = parsed.error.code || res.statusCode;
              const transient = code === 429 || (code >= 500 && code < 600);
              const err = new Error(parsed.error.message || 'OpenRouter API error');
              err.transient = transient;
              return reject(err);
            }
            const content = parsed.choices?.[0]?.message?.content;
            if (!content) return reject(new Error('No content in OpenRouter response'));
            resolve(content);
          } catch (err) {
            reject(new Error(`Failed to parse OpenRouter response: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => {
        const wrap = new Error(`OpenRouter request failed: ${err.message}`);
        wrap.transient = true;
        reject(wrap);
      });

      req.setTimeout(60000, () => {
        const err = new Error('OpenRouter request timed out after 60s');
        err.transient = true;
        req.destroy(err);
      });

      req.write(body);
      req.end();
    });

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await doOnce();
      } catch (err) {
        lastErr = err;
        if (err && err.transient && attempt < retries) {
          await this._sleep(500 * Math.pow(2, attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  /**
   * Parse JSON from AI response using 3-strategy parser:
   * 1) direct parse, 2) markdown ```json fence, 3) greedy {...} match.
   * Falls back to a caller-provided default merged with rawResponse on failure.
   */
  _parseJson(content, fallback = {}) {
    const result = parseAIJson(content);
    if (result.ok) return result.data;
    return { ...fallback, rawResponse: content };
  }

  /**
   * General-purpose call. Accepts system + user prompt, returns parsed JSON or raw text.
   */
  async call(systemPrompt, userPrompt, maxTokens = 4096) {
    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], maxTokens);
    return this._parseJson(content);
  }

  /**
   * Analyze radiology findings with full structured output.
   */
  async analyzeRadiology({ patient_id, image_type, findings_text, patient_history }) {
    const systemPrompt = `You are an expert radiologist AI assistant. Analyze the provided radiological findings and generate a comprehensive structured assessment. Return valid JSON only — no markdown fences or extra text.`;

    const userPrompt = `Analyze the following radiological case:
Patient ID: ${patient_id || 'N/A'}
Image Type / Modality: ${image_type}
Patient History: ${patient_history || 'Not provided'}
Findings: ${findings_text}

Return a JSON object with exactly these keys:
- preliminary_impression: string — concise overall impression
- key_findings: array of strings — major findings in order of clinical importance
- differential_diagnoses: array of { diagnosis, probability, reasoning } sorted by probability (highest first)
- recommended_follow_up: string — specific follow-up imaging or clinical steps
- urgency_level: one of "routine" | "urgent" | "emergent"
- icd10_codes: array of { code, description } — most relevant ICD-10 codes`;

    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return this._parseJson(content, {
      preliminary_impression: content,
      key_findings: [],
      differential_diagnoses: [],
      recommended_follow_up: 'Clinical correlation recommended.',
      urgency_level: 'routine',
      icd10_codes: [],
    });
  }

  /**
   * Generate a structured radiology report.
   */
  async generateReport(patientInfo, analysisData) {
    const systemPrompt = `You are an expert radiologist AI assistant that generates structured radiology reports following ACR reporting guidelines. Return valid JSON only.`;

    const userPrompt = `Generate a complete radiology report for:
Patient: ${JSON.stringify(patientInfo)}
Analysis: ${JSON.stringify(analysisData)}

Return a JSON object with keys:
- clinical_indication: string
- technique: string
- findings: string — detailed findings narrative
- impression: string — concise impression
- recommendations: string
- report_text: string — the complete formatted report ready for printing`;

    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return this._parseJson(content, {
      clinical_indication: 'See clinical notes.',
      technique: `${analysisData.image_type || 'Imaging study'} was performed.`,
      findings: analysisData.preliminary_impression || 'See attached findings.',
      impression: 'Please review findings above.',
      recommendations: 'Clinical correlation recommended.',
      report_text: content,
    });
  }

  /**
   * Fast critical findings check — uses lower token budget for speed.
   */
  async checkCriticalFindings(findingsText) {
    const systemPrompt = `You are an emergency radiology AI assistant. Rapidly identify life-threatening or critical radiological findings. Return valid JSON only.`;

    const userPrompt = `Review these radiology findings for critical/emergent conditions:
"${findingsText}"

Check specifically for: tension pneumothorax, aortic dissection, aortic aneurysm rupture, ischemic stroke, hemorrhagic stroke, massive pulmonary embolism, cardiac tamponade, bowel ischemia/perforation, epidural hematoma, subdural hematoma, subarachnoid hemorrhage, meningitis signs.

Return a JSON object with keys:
- is_critical: boolean
- findings: array of { condition, severity: 'emergent'|'urgent'|'routine', description }
- recommended_action: string — immediate next steps
- notify_immediately: boolean — true if radiologist/clinician must be called NOW`;

    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 1024);

    return this._parseJson(content, {
      is_critical: false,
      findings: [],
      recommended_action: 'Standard workflow.',
      notify_immediately: false,
    });
  }

  /**
   * Generate follow-up recommendations.
   */
  async generateFollowUp(patient, diagnosis) {
    const systemPrompt = `You are a radiology AI assistant specializing in follow-up care planning. Return valid JSON only.`;

    const userPrompt = `Generate follow-up recommendations for:
Patient: ${JSON.stringify(patient)}
Diagnosis: ${diagnosis}

Return a JSON object with keys:
- follow_up_imaging: array of { modality, body_part, timeframe, rationale }
- specialist_referrals: array of { specialty, urgency, reason }
- monitoring_intervals: array of { parameter, frequency, rationale }
- patient_instructions: array of strings
- red_flag_symptoms: array of symptoms requiring immediate medical attention`;

    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return this._parseJson(content, {
      follow_up_imaging: [],
      specialist_referrals: [],
      monitoring_intervals: [],
      patient_instructions: ['Follow up with your physician as directed.'],
      red_flag_symptoms: [],
    });
  }

  // ── Backwards-compatible methods used by existing analysis.js / reports.js ──

  async analyzeImage(imageDescription, bodyPart, modality) {
    const messages = [
      {
        role: 'system',
        content: `You are an expert radiologist AI assistant specializing in medical image analysis. Provide detailed, structured radiology findings. Return as a JSON object with fields: findings, confidence_score (0-100), areas_of_interest (array of { region, description }), recommendations.`,
      },
      {
        role: 'user',
        content: `Analyze: Modality: ${modality}, Body Part: ${bodyPart}, Description: ${imageDescription}`,
      },
    ];
    const content = await this._makeRequest(messages);
    return this._parseJson(content, {
      findings: content,
      confidence_score: 75.0,
      areas_of_interest: [],
      recommendations: 'Clinical correlation recommended.',
    });
  }

  async searchSimilarStudies(findings, modality, bodyPart) {
    const messages = [
      {
        role: 'system',
        content: `You are a radiology AI assistant. Return JSON with: suggested_search_terms (array), similar_conditions (array of { condition, relevance_score }), comparison_points (array), recommended_timeframe.`,
      },
      {
        role: 'user',
        content: `Find similar studies for: Findings: ${findings}, Modality: ${modality}, Body Part: ${bodyPart}`,
      },
    ];
    const content = await this._makeRequest(messages);
    return this._parseJson(content, {
      suggested_search_terms: [modality, bodyPart],
      similar_conditions: [],
      comparison_points: [findings],
      recommended_timeframe: '12 months',
    });
  }

  async generateReport_legacy(patientInfo, findings, imageDetails) {
    const messages = [
      {
        role: 'system',
        content: `You are an expert radiologist AI. Generate structured radiology reports. Return JSON with: clinical_history, technique, findings, impression, recommendations, report_text.`,
      },
      {
        role: 'user',
        content: `Generate report:\nPatient: ${JSON.stringify(patientInfo)}\nImage: ${JSON.stringify(imageDetails)}\nFindings: ${findings}`,
      },
    ];
    const content = await this._makeRequest(messages);
    return this._parseJson(content, {
      clinical_history: patientInfo.medical_history || 'See clinical notes.',
      technique: `${imageDetails.modality} of the ${imageDetails.body_part} was performed.`,
      findings,
      impression: 'Please review findings above.',
      recommendations: 'Clinical correlation recommended.',
      report_text: content,
    });
  }

  // ── Audit-driven new features ─────────────────────────────────────

  /**
   * Auto-populate report sections + suggest ICD-10/CPT codes by image type/findings.
   */
  async reportTemplating({ modality, body_part, findings, specialty }) {
    const systemPrompt = `You are a radiology reporting assistant. Generate templated report sections and suggest ICD-10 / CPT codes. Return valid JSON only.`;
    const userPrompt = `Modality: ${modality || 'N/A'}
Body Part: ${body_part || 'N/A'}
Specialty Template: ${specialty || 'general'}
Findings: ${findings || 'See raw notes'}

Return JSON with keys:
- template_sections: { clinical_history, technique, comparison, findings, impression, recommendations }
- icd10_codes: array of { code, description, confidence }
- cpt_codes: array of { code, description, modifiers }
- structured_findings: array of { region, observation, severity }`;
    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    return this._parseJson(content, {
      template_sections: {},
      icd10_codes: [],
      cpt_codes: [],
      structured_findings: [],
    });
  }

  /**
   * Smart prior-study comparison: align current vs. prior, highlight interval changes.
   */
  async priorStudyComparison({ current_findings, prior_studies = [], modality, body_part }) {
    const systemPrompt = `You are a radiologist comparing a current study to prior imaging. Identify interval changes and stability. Return valid JSON only.`;
    const priorSummary = prior_studies.map((p, i) =>
      `[${i + 1}] ${p.study_date || '?'} ${p.modality || ''} ${p.body_part || ''} — ${p.findings || p.summary || 'no summary'}`
    ).join('\n');
    const userPrompt = `Modality: ${modality}
Body part: ${body_part}
Current findings: ${current_findings}

Prior studies (most recent first):
${priorSummary || 'None provided'}

Return JSON with keys:
- aligned_priors: array of { study_index, similarity_score (0-100), aligned_region }
- interval_changes: array of { region, change_type ("new"|"resolved"|"stable"|"progressed"|"regressed"), description }
- stability_summary: string
- recommended_followup_interval: string`;
    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    return this._parseJson(content, {
      aligned_priors: [],
      interval_changes: [],
      stability_summary: 'Unable to compare.',
      recommended_followup_interval: 'See radiologist guidance.',
    });
  }

  /**
   * Predict report turnaround time given radiologist + study complexity.
   */
  async turnaroundPredictor({ radiologist, modality, complexity, queue_length }) {
    const systemPrompt = `You are a workflow analytics AI. Predict radiology report turnaround time. Return valid JSON only.`;
    const userPrompt = `Radiologist: ${JSON.stringify(radiologist || {})}
Modality: ${modality}
Complexity (1-5): ${complexity || 3}
Current queue length: ${queue_length || 0}

Return JSON with keys:
- predicted_minutes: number
- confidence: "high"|"medium"|"low"
- factors: array of strings
- queue_position_recommendation: string
- callback_window: { start_minutes_from_now: number, end_minutes_from_now: number }`;
    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 1024);
    return this._parseJson(content, {
      predicted_minutes: 60,
      confidence: 'low',
      factors: [],
      queue_position_recommendation: 'standard queue',
      callback_window: { start_minutes_from_now: 60, end_minutes_from_now: 120 },
    });
  }

  /**
   * Incidental finding extractor — flags incidentals from free-text findings.
   */
  async incidentalFindings({ findings_text, primary_indication }) {
    const systemPrompt = `You are a radiologist extracting incidental findings. An incidental finding is a clinically relevant observation NOT related to the primary indication. Return valid JSON only.`;
    const userPrompt = `Primary indication: ${primary_indication || 'unspecified'}
Findings text: ${findings_text}

Return JSON with keys:
- incidental_findings: array of { finding, organ_system, urgency ("urgent"|"non_urgent"|"observation"), recommended_followup, recommended_specialist }
- requires_patient_notification: boolean
- followup_protocol_match: string (e.g. "Fleischner Society pulmonary nodule guidelines")`;
    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    return this._parseJson(content, {
      incidental_findings: [],
      requires_patient_notification: false,
      followup_protocol_match: 'No specific protocol matched',
    });
  }

  /**
   * QA audit: compare two radiologist reports on the same case.
   */
  async qaAuditCompare({ report_a, report_b, image_summary }) {
    const systemPrompt = `You are a radiology QA reviewer. Compare two reports on the same case for diagnostic concordance and discrepancies. Return valid JSON only.`;
    const userPrompt = `Image summary: ${image_summary || 'See findings'}
Report A: ${report_a}
Report B: ${report_b}

Return JSON with keys:
- concordance_score: number (0-100)
- agreements: array of strings
- discrepancies: array of { area, severity ("major"|"minor"), reportA_finding, reportB_finding, likely_correct ("A"|"B"|"unclear") }
- requires_qa_review: boolean
- recommended_action: string`;
    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    return this._parseJson(content, {
      concordance_score: 0,
      agreements: [],
      discrepancies: [],
      requires_qa_review: true,
      recommended_action: 'Manual review required.',
    });
  }

  /**
   * Insurance pre-authorization assistant.
   */
  async insurancePreauth({ procedure_code, diagnosis, payer, patient_history }) {
    const systemPrompt = `You are a healthcare prior-authorization assistant. Apply payer coverage rules and recommend approve/deny with documentation needed. Return valid JSON only.`;
    const userPrompt = `Procedure code: ${procedure_code || 'N/A'}
Diagnosis: ${diagnosis || 'N/A'}
Payer: ${payer || 'unspecified'}
Patient history: ${patient_history || 'none'}

Return JSON with keys:
- decision: "approve"|"deny"|"needs_more_info"
- decision_rationale: string
- required_documentation: array of strings
- alternative_procedures: array of { code, description, rationale }
- appeal_strategy: string
- estimated_processing_days: number`;
    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    return this._parseJson(content, {
      decision: 'needs_more_info',
      decision_rationale: 'Insufficient data',
      required_documentation: [],
      alternative_procedures: [],
      appeal_strategy: 'Submit clinical notes and prior imaging.',
      estimated_processing_days: 7,
    });
  }

  /**
   * Patient portal plain-language summary of a radiology report.
   */
  async patientPortalSummary({ report_text, reading_level }) {
    const systemPrompt = `You are a patient-friendly explainer. Translate a radiology report into clear, calm, non-alarming plain language at the requested reading level. Return valid JSON only.`;
    const userPrompt = `Reading level: ${reading_level || 'grade 7'}
Report:
${report_text}

Return JSON with keys:
- plain_language_summary: string (2-4 short paragraphs)
- key_points: array of strings (one sentence each)
- next_steps_for_patient: array of strings
- glossary: array of { term, definition }
- when_to_call_doctor: array of strings`;
    const content = await this._makeRequest([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);
    return this._parseJson(content, {
      plain_language_summary: 'Please review the full report with your physician.',
      key_points: [],
      next_steps_for_patient: ['Discuss the report with your doctor.'],
      glossary: [],
      when_to_call_doctor: ['Call your doctor if you experience worsening symptoms.'],
    });
  }

  async draftImpression(findings) {
    const messages = [
      {
        role: 'system',
        content: `You are an expert radiologist AI. Generate concise impressions. Return JSON with: impression, key_findings (array), urgency_level (routine|urgent|emergent), follow_up_needed (boolean).`,
      },
      {
        role: 'user',
        content: `Generate impression for: ${findings}`,
      },
    ];
    const content = await this._makeRequest(messages);
    return this._parseJson(content, {
      impression: content,
      key_findings: [],
      urgency_level: 'routine',
      follow_up_needed: false,
    });
  }
}

// Persist an AI result to ai_results JSONB table — best-effort, never throws.
const pool = require('../db/pool');
async function persistAIResult({ feature, user_id, entity_type, entity_id, prompt_summary, result, model }) {
  try {
    const insert = await pool.query(
      `INSERT INTO ai_results (feature, user_id, entity_type, entity_id, prompt_summary, result, model)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
      [
        feature,
        user_id || null,
        entity_type || null,
        entity_id || null,
        prompt_summary || null,
        JSON.stringify(result || {}),
        model || (process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022'),
      ]
    );
    return insert.rows[0];
  } catch (err) {
    console.warn('[ai_results] persist skipped:', err.message);
    return null;
  }
}

const service = new OpenRouterService();
service.persistAIResult = persistAIResult;
module.exports = service;
