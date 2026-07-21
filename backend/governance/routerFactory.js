function createGovernedRouter({ express, workflow, auth, db }) {
  const crypto = require('node:crypto');
  const router = express.Router();
  const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  const connectorNames = new Set((workflow.config.connectors || []).map((item) => item.name));

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    }
    return value;
  }

  function sameJson(left, right) {
    return JSON.stringify(canonical(left || {})) === JSON.stringify(canonical(right || {}));
  }

  function requestDigest(value) {
    return crypto.createHash('sha256').update(JSON.stringify(canonical(value || {}))).digest('hex');
  }

  function tenant(req) {
    const value = String(req.headers['x-tenant-id'] || '');
    if (!identifier.test(value)) {
      const error = new Error('A valid X-Tenant-Id is required.');
      error.code = 'TENANT_REQUIRED';
      error.status = 400;
      throw error;
    }
    return value;
  }

  function inScope(req, subjectRef) {
    const prefix = String(req.governanceScope || '*');
    return prefix === '*' || String(subjectRef || '').startsWith(prefix);
  }

  function respondError(res, error) {
    if (error.code === '23505') return res.status(409).json({ error: 'IDEMPOTENCY_CONFLICT' });
    return res.status(error.status || 500).json({
      error: error.code || 'WORKFLOW_FAILURE',
      message: error.status ? error.message : 'The governed workflow could not complete.',
    });
  }

  router.use(auth);

  router.use(async (req, res, next) => {
    try {
      const tenantId = tenant(req);
      const actorId = String(req.user && req.user.id || '');
      if (!identifier.test(actorId)) return res.status(401).json({ error: 'AUTH_CONTEXT_INVALID' });
      const memberships = await db.query(
        `SELECT role, subject_ref_prefix FROM governed_tenant_memberships
         WHERE tenant_id=$1 AND actor_id=$2 AND active=TRUE`,
        [tenantId, actorId]
      );
      if (!memberships[0]) return res.status(403).json({ error: 'TENANT_MEMBERSHIP_REQUIRED' });
      req.user = { ...req.user, role: memberships[0].role };
      req.governanceScope = memberships[0].subject_ref_prefix;
      next();
    } catch (error) {
      respondError(res, error);
    }
  });

  router.get('/policy', (_req, res) => {
    res.json({
      caseType: workflow.config.caseType,
      states: workflow.config.states,
      transitions: workflow.config.transitions,
      evidenceKinds: workflow.config.evidenceKinds,
      professionalBoundary: workflow.config.professionalBoundary,
      automatedFinalDecisions: false,
      connectors: (workflow.config.connectors || []).map((item) => ({
        ...item,
        configured: false,
        mode: 'quarantined_until_credentialed_and_contract_tested',
      })),
    });
  });

  router.get('/cases', async (req, res) => {
    try {
      const rows = await db.query(
        `SELECT id, subject_ref, case_type, state, policy_version, effective_at, version,
                retention_until, created_at, updated_at
         FROM governed_cases
         WHERE tenant_id=$1 AND ($2='*' OR LEFT(subject_ref, char_length($2))=$2)
         ORDER BY created_at DESC LIMIT 200`,
        [tenant(req), req.governanceScope]
      );
      res.json(rows);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/cases', async (req, res) => {
    try {
      const ctx = workflow.context(req.headers, req.user);
      const item = workflow.createCase(req.body || {}, ctx);
      if (!inScope(req, item.subjectRef)) return res.status(403).json({ error: 'SUBJECT_SCOPE_REQUIRED' });
      const inserted = await db.query(
        `INSERT INTO governed_cases
          (id, tenant_id, idempotency_key, case_type, subject_ref, state, policy_version,
           effective_at, source_snapshot, retention_until, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING *`,
        [item.id, item.tenantId, item.idempotencyKey, item.caseType, item.subjectRef, item.state,
          item.policyVersion, item.effectiveAt, JSON.stringify(item.sourceSnapshot),
          item.retentionUntil, item.createdBy]
      );
      if (inserted[0]) return res.status(201).json(inserted[0]);
      const existing = await db.query(
        `SELECT * FROM governed_cases
         WHERE tenant_id=$1 AND idempotency_key=$2 AND ($3='*' OR LEFT(subject_ref, char_length($3))=$3)`,
        [ctx.tenantId, ctx.idempotencyKey, req.governanceScope]
      );
      if (!existing[0]) return res.status(409).json({ error: 'IDEMPOTENCY_CONFLICT' });
      if (existing[0].subject_ref !== item.subjectRef ||
          existing[0].policy_version !== item.policyVersion ||
          new Date(existing[0].effective_at).toISOString() !== item.effectiveAt ||
          (existing[0].retention_until && new Date(existing[0].retention_until).toISOString()) !== item.retentionUntil ||
          !sameJson(existing[0].source_snapshot, item.sourceSnapshot)) {
        return res.status(409).json({ error: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
      }
      return res.status(200).json({ ...existing[0], idempotentReplay: true });
    } catch (error) {
      respondError(res, error);
    }
  });

  router.get('/cases/:id', async (req, res) => {
    try {
      const rows = await db.query(
        `SELECT c.*, COALESCE(json_agg(e ORDER BY e.created_at)
          FILTER (WHERE e.id IS NOT NULL), '[]') AS evidence
         FROM governed_cases c
         LEFT JOIN governed_evidence e ON e.case_id=c.id AND e.tenant_id=c.tenant_id
         WHERE c.id=$1 AND c.tenant_id=$2 AND ($3='*' OR LEFT(c.subject_ref, char_length($3))=$3)
         GROUP BY c.id`,
        [req.params.id, tenant(req), req.governanceScope]
      );
      if (!rows[0]) return res.status(404).json({ error: 'CASE_NOT_FOUND' });
      res.json(rows[0]);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.get('/cases/:id/history', async (req, res) => {
    try {
      const rows = await db.query(
        `SELECT e.id, e.event_type, e.action, e.from_state, e.to_state, e.reason,
                e.actor_id, e.actor_role, e.details, e.created_at
         FROM governed_events e
         JOIN governed_cases c ON c.id=e.case_id AND c.tenant_id=e.tenant_id
         WHERE e.case_id=$1 AND e.tenant_id=$2 AND ($3='*' OR LEFT(c.subject_ref, char_length($3))=$3)
         ORDER BY e.created_at, e.id`,
        [req.params.id, tenant(req), req.governanceScope]
      );
      res.json(rows);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/cases/:id/evidence', async (req, res) => {
    try {
      const ctx = workflow.context(req.headers, req.user);
      const item = workflow.evidence(req.body || {});
      const rows = await db.query(
        `INSERT INTO governed_evidence
          (id, tenant_id, case_id, idempotency_key, kind, source_ref, source_version,
           sha256, captured_at, consent_basis, metadata, created_by)
         SELECT $1,$2,c.id,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12
         FROM governed_cases c
         WHERE c.id=$3 AND c.tenant_id=$2 AND ($13='*' OR LEFT(c.subject_ref, char_length($13))=$13)
         ON CONFLICT DO NOTHING RETURNING *`,
        [item.id, ctx.tenantId, req.params.id, ctx.idempotencyKey, item.kind, item.sourceRef,
          item.sourceVersion, item.sha256, item.capturedAt, item.consentBasis,
          JSON.stringify(item.metadata), ctx.actorId, req.governanceScope]
      );
      if (rows[0]) return res.status(201).json(rows[0]);
      const existing = await db.query(
        `SELECT e.* FROM governed_evidence e
         JOIN governed_cases c ON c.id=e.case_id AND c.tenant_id=e.tenant_id
         WHERE e.tenant_id=$1
           AND (e.idempotency_key=$2 OR (e.case_id=$3 AND e.sha256=$4))
           AND ($5='*' OR LEFT(c.subject_ref, char_length($5))=$5)`,
        [ctx.tenantId, ctx.idempotencyKey, req.params.id, item.sha256, req.governanceScope]
      );
      if (!existing[0]) return res.status(404).json({ error: 'CASE_NOT_FOUND' });
      if (String(existing[0].case_id) !== String(req.params.id) ||
          existing[0].sha256 !== item.sha256 ||
          existing[0].kind !== item.kind ||
          existing[0].source_ref !== item.sourceRef ||
          existing[0].source_version !== item.sourceVersion ||
          new Date(existing[0].captured_at).toISOString() !== item.capturedAt ||
          (existing[0].consent_basis || null) !== item.consentBasis ||
          !sameJson(existing[0].metadata, item.metadata)) {
        return res.status(409).json({ error: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
      }
      res.status(200).json({ ...existing[0], idempotentReplay: true });
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/cases/:id/assess', async (req, res) => {
    try {
      const ctx = workflow.context(req.headers, req.user);
      const digest = requestDigest(req.body || {});
      const prior = await db.query(
        `SELECT id, case_id, action, details FROM governed_events
         WHERE tenant_id=$1 AND idempotency_key=$2`,
        [ctx.tenantId, ctx.idempotencyKey]
      );
      if (prior[0]) {
        if (String(prior[0].case_id) !== String(req.params.id) || prior[0].action !== 'assess' ||
            prior[0].details.requestDigest !== digest) {
          return res.status(409).json({ error: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
        }
        const { requestDigest: _requestDigest, ...replayed } = prior[0].details;
        return res.json({ ...replayed, eventId: prior[0].id, idempotentReplay: true });
      }
      const assessment = workflow.deterministicAssessment(req.body || {}, ctx);
      const events = await db.query(
        `INSERT INTO governed_events
          (id, tenant_id, case_id, idempotency_key, event_type, action, from_state,
           to_state, reason, actor_id, actor_role, details)
         SELECT $1,$2,c.id,$4,'assessment','assess',c.state,c.state,
                'Deterministic triage; no final decision',$5,$6,$7::jsonb
         FROM governed_cases c
         WHERE c.id=$3 AND c.tenant_id=$2 AND ($8='*' OR LEFT(c.subject_ref, char_length($8))=$8)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), ctx.tenantId, req.params.id, ctx.idempotencyKey,
          ctx.actorId, ctx.role, JSON.stringify({ ...assessment, requestDigest: digest }), req.governanceScope]
      );
      if (!events[0]) return res.status(409).json({ error: 'CASE_NOT_FOUND_OR_REPLAY_CONFLICT' });
      res.json({ ...assessment, eventId: events[0].id });
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/cases/:id/transitions', async (req, res) => {
    try {
      const ctx = workflow.context(req.headers, req.user);
      const digest = requestDigest(req.body || {});
      const result = await db.transaction(async (query) => {
        const prior = await query(
          `SELECT id, case_id, action, to_state, details FROM governed_events
           WHERE tenant_id=$1 AND idempotency_key=$2`,
          [ctx.tenantId, ctx.idempotencyKey]
        );
        if (prior[0]) {
          if (String(prior[0].case_id) !== String(req.params.id) ||
              prior[0].action !== String(req.body && req.body.action || '') ||
              prior[0].details.requestDigest !== digest) {
            const error = new Error('Idempotency key was used for another operation.');
            error.code = 'IDEMPOTENCY_PAYLOAD_CONFLICT';
            error.status = 409;
            throw error;
          }
          return {
            id: prior[0].case_id,
            state: prior[0].to_state,
            version: prior[0].details.toVersion,
            eventId: prior[0].id,
            idempotentReplay: true,
          };
        }
        const cases = await query(
          `SELECT c.*,
             (SELECT count(*) FROM governed_evidence e
              WHERE e.case_id=c.id AND e.tenant_id=c.tenant_id) AS evidence_count,
             (SELECT actor_id FROM governed_events e
              WHERE e.case_id=c.id AND e.tenant_id=c.tenant_id AND e.event_type='transition'
              ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS last_actor_id
           FROM governed_cases c
           WHERE c.id=$1 AND c.tenant_id=$2 AND ($3='*' OR LEFT(c.subject_ref, char_length($3))=$3)
           FOR UPDATE`,
          [req.params.id, ctx.tenantId, req.governanceScope]
        );
        if (!cases[0]) {
          const error = new Error('Case not found.');
          error.code = 'CASE_NOT_FOUND';
          error.status = 404;
          throw error;
        }
        const current = cases[0];
        const decision = workflow.transition({
          state: current.state,
          version: current.version,
          evidenceCount: current.evidence_count,
          createdBy: current.created_by,
          lastActorId: current.last_actor_id,
        }, req.body || {}, ctx);
        const updated = await query(
          `UPDATE governed_cases SET state=$1, version=version+1, updated_at=NOW()
           WHERE id=$2 AND tenant_id=$3 AND version=$4 RETURNING *`,
          [decision.to, current.id, ctx.tenantId, current.version]
        );
        if (!updated[0]) {
          const error = new Error('Case changed concurrently.');
          error.code = 'VERSION_CONFLICT';
          error.status = 409;
          throw error;
        }
        await query(
          `INSERT INTO governed_events
            (id, tenant_id, case_id, idempotency_key, event_type, action, from_state,
             to_state, reason, actor_id, actor_role, details)
           VALUES ($1,$2,$3,$4,'transition',$5,$6,$7,$8,$9,$10,$11::jsonb)`,
          [decision.eventId, ctx.tenantId, current.id, ctx.idempotencyKey, decision.action,
            current.state, decision.to, decision.reason, ctx.actorId, ctx.role,
            JSON.stringify({ fromVersion: current.version, toVersion: updated[0].version, requestDigest: digest })]
        );
        return { ...updated[0], eventId: decision.eventId };
      });
      res.json(result);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.get('/outbox', async (req, res) => {
    try {
      const allowed = new Set([...(workflow.config.connectorRoles || []), ...(workflow.config.auditRoles || [])]);
      if (!allowed.has(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
      const rows = await db.query(
        `SELECT o.id, o.case_id, o.provider, o.operation, o.status, o.attempts, o.max_attempts,
                o.available_at, o.next_attempt_at, o.last_error_code, o.delivered_at,
                o.dead_lettered_at, o.created_at
         FROM governed_outbox o
         JOIN governed_cases c ON c.id=o.case_id AND c.tenant_id=o.tenant_id
         WHERE o.tenant_id=$1 AND ($2='*' OR LEFT(c.subject_ref, char_length($2))=$2)
         ORDER BY o.created_at DESC LIMIT 200`,
        [tenant(req), req.governanceScope]
      );
      res.json(rows);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/cases/:id/outbox', async (req, res) => {
    try {
      const ctx = workflow.context(req.headers, req.user);
      const allowed = new Set(workflow.config.connectorRoles || []);
      if (!allowed.has(ctx.role)) return res.status(403).json({ error: 'FORBIDDEN' });
      const item = workflow.outbox(req.body || {});
      const rows = await db.query(
        `INSERT INTO governed_outbox
          (id, tenant_id, case_id, idempotency_key, provider, operation, payload,
           status, attempts, max_attempts, available_at)
         SELECT $1,$2,c.id,$4,$5,$6,$7::jsonb,'pending',0,$8,$9
         FROM governed_cases c
         WHERE c.id=$3 AND c.tenant_id=$2 AND ($10='*' OR LEFT(c.subject_ref, char_length($10))=$10)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING *`,
        [item.id, ctx.tenantId, req.params.id, ctx.idempotencyKey, item.provider,
          item.operation, JSON.stringify(item.payload), item.maxAttempts, item.availableAt,
          req.governanceScope]
      );
      if (rows[0]) return res.status(201).json(rows[0]);
      const existing = await db.query(
        `SELECT o.* FROM governed_outbox o
         JOIN governed_cases c ON c.id=o.case_id AND c.tenant_id=o.tenant_id
         WHERE o.tenant_id=$1 AND o.idempotency_key=$2
           AND ($3='*' OR LEFT(c.subject_ref, char_length($3))=$3)`,
        [ctx.tenantId, ctx.idempotencyKey, req.governanceScope]
      );
      if (!existing[0]) return res.status(404).json({ error: 'CASE_NOT_FOUND' });
      if (String(existing[0].case_id) !== String(req.params.id) ||
          existing[0].provider !== item.provider || existing[0].operation !== item.operation ||
          Number(existing[0].max_attempts) !== item.maxAttempts ||
          !sameJson(existing[0].payload, item.payload) ||
          (req.body && req.body.availableAt && new Date(existing[0].available_at).toISOString() !== item.availableAt)) {
        return res.status(409).json({ error: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
      }
      res.json({ ...existing[0], idempotentReplay: true });
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/outbox/:id/attempts', async (req, res) => {
    try {
      const ctx = workflow.context(req.headers, req.user);
      const allowed = new Set(workflow.config.connectorRoles || []);
      if (!allowed.has(ctx.role)) return res.status(403).json({ error: 'FORBIDDEN' });
      const input = req.body || {};
      const outcome = String(input.outcome || '');
      if (!['delivered','retryable_failure','permanent_failure'].includes(outcome)) {
        return res.status(400).json({ error: 'OUTCOME_INVALID' });
      }
      const expectedAttempts = Number(input.expectedAttempts);
      if (!Number.isSafeInteger(expectedAttempts) || expectedAttempts < 0) {
        return res.status(400).json({ error: 'EXPECTED_ATTEMPTS_REQUIRED' });
      }
      const errorCode = input.errorCode ? String(input.errorCode) : null;
      if (outcome !== 'delivered' && !identifier.test(errorCode || '')) {
        return res.status(400).json({ error: 'ERROR_CODE_REQUIRED' });
      }
      const receiptRef = input.receiptRef ? String(input.receiptRef) : null;
      const receiptSha256 = input.receiptSha256 ? String(input.receiptSha256).toLowerCase() : null;
      if (outcome === 'delivered' && errorCode) {
        return res.status(400).json({ error: 'DELIVERY_ERROR_CODE_NOT_ALLOWED' });
      }
      if (outcome !== 'delivered' && (receiptRef || receiptSha256)) {
        return res.status(400).json({ error: 'FAILURE_RECEIPT_NOT_ALLOWED' });
      }
      if (outcome === 'delivered' &&
          (!receiptRef || receiptRef.length > 512 || /\s/.test(receiptRef) ||
           !/^[a-f0-9]{64}$/.test(receiptSha256 || ''))) {
        return res.status(400).json({ error: 'DELIVERY_RECEIPT_REQUIRED' });
      }
      if (input.nextAttemptAt && Number.isNaN(Date.parse(input.nextAttemptAt))) {
        return res.status(400).json({ error: 'NEXT_ATTEMPT_INVALID' });
      }
      if (outcome !== 'retryable_failure' && input.nextAttemptAt) {
        return res.status(400).json({ error: 'NEXT_ATTEMPT_NOT_ALLOWED' });
      }
      const result = await db.transaction(async (query) => {
        const prior = await query(
          `SELECT * FROM governed_outbox_attempts
           WHERE tenant_id=$1 AND idempotency_key=$2`,
          [ctx.tenantId, ctx.idempotencyKey]
        );
        if (prior[0]) {
          const priorNext = prior[0].next_attempt_at ? new Date(prior[0].next_attempt_at).toISOString() : null;
          const requestedNext = input.nextAttemptAt ? new Date(input.nextAttemptAt).toISOString() : null;
          if (String(prior[0].outbox_id) !== String(req.params.id) || prior[0].outcome !== outcome ||
              (prior[0].error_code || null) !== errorCode ||
              (prior[0].receipt_ref || null) !== receiptRef ||
              (prior[0].receipt_sha256 || null) !== receiptSha256 || priorNext !== requestedNext) {
            const error = new Error('Idempotency key was used for another operation.');
            error.code = 'IDEMPOTENCY_PAYLOAD_CONFLICT';
            error.status = 409;
            throw error;
          }
          return { ...prior[0], idempotentReplay: true };
        }
        const rows = await query(
          `SELECT o.* FROM governed_outbox o
           JOIN governed_cases c ON c.id=o.case_id AND c.tenant_id=o.tenant_id
           WHERE o.id=$1 AND o.tenant_id=$2
             AND ($3='*' OR LEFT(c.subject_ref, char_length($3))=$3) FOR UPDATE`,
          [req.params.id, ctx.tenantId, req.governanceScope]
        );
        if (!rows[0]) {
          const error = new Error('Outbox item not found.');
          error.code = 'OUTBOX_NOT_FOUND';
          error.status = 404;
          throw error;
        }
        const current = rows[0];
        if (current.status !== 'pending') {
          const error = new Error('Outbox item is no longer pending.');
          error.code = 'OUTBOX_TERMINAL';
          error.status = 409;
          throw error;
        }
        if (Number(current.attempts) !== expectedAttempts) {
          const error = new Error('Outbox attempt count changed.');
          error.code = 'VERSION_CONFLICT';
          error.status = 409;
          throw error;
        }
        const attempts = expectedAttempts + 1;
        let status = 'delivered';
        let nextAttemptAt = null;
        if (outcome === 'retryable_failure' && attempts < Number(current.max_attempts)) {
          if (!input.nextAttemptAt || Number.isNaN(Date.parse(input.nextAttemptAt)) ||
              Date.parse(input.nextAttemptAt) <= Date.now()) {
            const error = new Error('A future nextAttemptAt is required for retry.');
            error.code = 'NEXT_ATTEMPT_REQUIRED';
            error.status = 400;
            throw error;
          }
          status = 'pending';
          nextAttemptAt = new Date(input.nextAttemptAt).toISOString();
        } else if (outcome !== 'delivered') {
          status = 'dead_letter';
        }
        const attemptId = crypto.randomUUID();
        await query(
          `INSERT INTO governed_outbox_attempts
            (id, tenant_id, outbox_id, idempotency_key, outcome, error_code,
             receipt_ref, receipt_sha256, attempted_by, next_attempt_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [attemptId, ctx.tenantId, current.id, ctx.idempotencyKey, outcome, errorCode,
            receiptRef, receiptSha256, ctx.actorId, nextAttemptAt]
        );
        const updated = await query(
          `UPDATE governed_outbox
           SET status=$1, attempts=$2, next_attempt_at=$3, last_error_code=$4,
               delivered_at=CASE WHEN $1='delivered' THEN NOW() ELSE delivered_at END,
               dead_lettered_at=CASE WHEN $1='dead_letter' THEN NOW() ELSE dead_lettered_at END,
               updated_at=NOW()
           WHERE id=$5 AND tenant_id=$6 AND attempts=$7 RETURNING *`,
          [status, attempts, nextAttemptAt, errorCode, current.id, ctx.tenantId, expectedAttempts]
        );
        if (!updated[0]) {
          const error = new Error('Outbox item changed concurrently.');
          error.code = 'VERSION_CONFLICT';
          error.status = 409;
          throw error;
        }
        return { ...updated[0], attemptId };
      });
      res.json(result);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.get('/connector-failures', async (req, res) => {
    try {
      const allowed = new Set(workflow.config.auditRoles || workflow.config.createRoles);
      if (!allowed.has(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
      const rows = await db.query(
        `SELECT f.id, f.case_id, f.provider, f.operation, f.error_code, f.retryable,
                f.attempts, f.first_seen_at, f.last_seen_at, f.resolved_at
         FROM governed_connector_failures f
         JOIN governed_cases c ON c.id=f.case_id AND c.tenant_id=f.tenant_id
         WHERE f.tenant_id=$1 AND ($2='*' OR LEFT(c.subject_ref, char_length($2))=$2)
         ORDER BY f.last_seen_at DESC LIMIT 200`,
        [tenant(req), req.governanceScope]
      );
      res.json(rows);
    } catch (error) {
      respondError(res, error);
    }
  });

  router.post('/cases/:id/connector-failures', async (req, res) => {
    try {
      const ctx = workflow.context(req.headers, req.user);
      const allowed = new Set(workflow.config.connectorRoles || workflow.config.createRoles);
      if (!allowed.has(ctx.role)) return res.status(403).json({ error: 'FORBIDDEN' });
      const { provider, operation, code, retryable = false } = req.body || {};
      if (![provider, operation, code].every((value) => identifier.test(String(value || '')))) {
        return res.status(400).json({ error: 'FAILURE_RECORD_INVALID' });
      }
      if (connectorNames.size && !connectorNames.has(provider)) {
        return res.status(400).json({ error: 'CONNECTOR_NOT_DECLARED' });
      }
      const rows = await db.query(
        `INSERT INTO governed_connector_failures
          (id, tenant_id, case_id, provider, operation, error_code, retryable, actor_id, idempotency_key)
         SELECT $1,$2,c.id,$4,$5,$6,$7,$8,$9
         FROM governed_cases c
         WHERE c.id=$3 AND c.tenant_id=$2 AND ($10='*' OR LEFT(c.subject_ref, char_length($10))=$10)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING *`,
        [crypto.randomUUID(), ctx.tenantId, req.params.id, provider, operation, code,
          Boolean(retryable), ctx.actorId, ctx.idempotencyKey, req.governanceScope]
      );
      if (rows[0]) return res.status(201).json(rows[0]);
      const existing = await db.query(
        `SELECT f.* FROM governed_connector_failures f
         JOIN governed_cases c ON c.id=f.case_id AND c.tenant_id=f.tenant_id
         WHERE f.tenant_id=$1 AND f.idempotency_key=$2
           AND ($3='*' OR LEFT(c.subject_ref, char_length($3))=$3)`,
        [ctx.tenantId, ctx.idempotencyKey, req.governanceScope]
      );
      if (!existing[0]) return res.status(404).json({ error: 'CASE_NOT_FOUND' });
      if (String(existing[0].case_id) !== String(req.params.id) ||
          existing[0].provider !== provider || existing[0].operation !== operation ||
          existing[0].error_code !== code || existing[0].retryable !== Boolean(retryable)) {
        return res.status(409).json({ error: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
      }
      res.json({ ...existing[0], idempotentReplay: true });
    } catch (error) {
      respondError(res, error);
    }
  });

  return router;
}

module.exports = { createGovernedRouter };
