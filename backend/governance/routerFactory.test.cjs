const test = require('node:test');
const assert = require('node:assert/strict');
const { createGovernedRouter } = require('./routerFactory');
const { createWorkflow } = require('./workflowCore');
const config = require('./config');

function harness(results, role) {
  const routes = [];
  const middleware = [];
  const calls = [];
  const express = {
    Router() {
      return {
        routes,
        middleware,
        use(handler) { middleware.push(handler); },
        get(path, handler) { routes.push({ method: 'GET', path, handler }); },
        post(path, handler) { routes.push({ method: 'POST', path, handler }); },
      };
    },
  };
  const queue = [...results];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return queue.shift() || [];
  };
  const db = { query, transaction: async (work) => work(query) };
  const auth = (req, _res, next) => { req.user = { id: 'actor-a' }; next(); };
  const router = createGovernedRouter({ express, workflow: createWorkflow(config), auth, db });
  const req = {
    headers: { 'x-tenant-id': 'tenant-a', 'idempotency-key': 'request-a' },
    params: {},
    body: {},
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  async function prepare() {
    let authenticated = false;
    middleware[0](req, res, () => { authenticated = true; });
    assert.equal(authenticated, true);
    let scoped = false;
    await middleware[1](req, res, () => { scoped = true; });
    return scoped;
  }
  function route(method, path) {
    return routes.find((item) => item.method === method && item.path === path).handler;
  }
  return { router, req, res, calls, prepare, route, role };
}

test('tenant membership applies subject scope to case listing', async () => {
  const h = harness([[{ role: config.createRoles[0], subject_ref_prefix: 'subject:' }], []]);
  assert.equal(await h.prepare(), true);
  await h.route('GET', '/cases')(h.req, h.res);
  assert.deepEqual(h.calls[1].params, ['tenant-a', 'subject:']);
  assert.ok(h.calls[1].sql.includes('LEFT(subject_ref, char_length($2))=$2'));
  assert.equal(h.res.statusCode, 200);
});

test('missing tenant membership fails closed', async () => {
  const h = harness([[]]);
  assert.equal(await h.prepare(), false);
  assert.equal(h.res.statusCode, 403);
  assert.equal(h.res.body.error, 'TENANT_MEMBERSHIP_REQUIRED');
});

test('outbox idempotency rejects a changed opaque payload', async () => {
  const connector = config.connectors[0].name;
  const h = harness([
    [{ role: config.connectorRoles[0], subject_ref_prefix: '*' }],
    [],
    [{ case_id: 'case-a', provider: connector, operation: 'sync', max_attempts: 3, payload: { version: 'old' } }],
  ]);
  await h.prepare();
  h.req.params.id = 'case-a';
  h.req.body = { provider: connector, operation: 'sync', payload: { version: 'new' }, maxAttempts: 3 };
  await h.route('POST', '/cases/:id/outbox')(h.req, h.res);
  assert.equal(h.res.statusCode, 409);
  assert.equal(h.res.body.error, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
});

test('outbox attempt idempotency rejects a changed receipt', async () => {
  const h = harness([
    [{ role: config.connectorRoles[0], subject_ref_prefix: '*' }],
    [{ outbox_id: 'outbox-a', outcome: 'delivered', error_code: null, receipt_ref: 'vault:old', receipt_sha256: 'a'.repeat(64), next_attempt_at: null }],
  ]);
  await h.prepare();
  h.req.params.id = 'outbox-a';
  h.req.body = { outcome: 'delivered', expectedAttempts: 0, receiptRef: 'vault:new', receiptSha256: 'b'.repeat(64) };
  await h.route('POST', '/outbox/:id/attempts')(h.req, h.res);
  assert.equal(h.res.statusCode, 409);
  assert.equal(h.res.body.error, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
});

test('retryable outbox failure schedules a bounded future retry', async () => {
  const nextAttemptAt = new Date(Date.now() + 60_000).toISOString();
  const h = harness([
    [{ role: config.connectorRoles[0], subject_ref_prefix: '*' }],
    [],
    [{ id: 'outbox-a', status: 'pending', attempts: 0, max_attempts: 3 }],
    [],
    [{ id: 'outbox-a', status: 'pending', attempts: 1, next_attempt_at: nextAttemptAt }],
  ]);
  await h.prepare();
  h.req.params.id = 'outbox-a';
  h.req.body = { outcome: 'retryable_failure', expectedAttempts: 0, errorCode: 'TEMPORARY', nextAttemptAt };
  await h.route('POST', '/outbox/:id/attempts')(h.req, h.res);
  assert.equal(h.res.statusCode, 200);
  assert.equal(h.res.body.status, 'pending');
  assert.equal(h.res.body.attempts, 1);
});

test('retry exhaustion moves the outbox item to dead letter', async () => {
  const h = harness([
    [{ role: config.connectorRoles[0], subject_ref_prefix: '*' }],
    [],
    [{ id: 'outbox-a', status: 'pending', attempts: 2, max_attempts: 3 }],
    [],
    [{ id: 'outbox-a', status: 'dead_letter', attempts: 3, dead_lettered_at: new Date().toISOString() }],
  ]);
  await h.prepare();
  h.req.params.id = 'outbox-a';
  h.req.body = { outcome: 'retryable_failure', expectedAttempts: 2, errorCode: 'EXHAUSTED' };
  await h.route('POST', '/outbox/:id/attempts')(h.req, h.res);
  assert.equal(h.res.statusCode, 200);
  assert.equal(h.res.body.status, 'dead_letter');
  assert.equal(h.res.body.attempts, 3);
});

test('connector failure listing joins cases before applying subject scope', async () => {
  const h = harness([[{ role: config.auditRoles[0], subject_ref_prefix: 'subject:' }], []]);
  await h.prepare();
  await h.route('GET', '/connector-failures')(h.req, h.res);
  assert.match(h.calls[1].sql, /JOIN governed_cases/);
  assert.deepEqual(h.calls[1].params, ['tenant-a', 'subject:']);
});

test('connector failure replay cannot cross case scope', async () => {
  const connector = config.connectors[0].name;
  const h = harness([
    [{ role: config.connectorRoles[0], subject_ref_prefix: '*' }],
    [],
    [{ case_id: 'case-b', provider: connector, operation: 'sync', error_code: 'FAILED', retryable: true }],
  ]);
  await h.prepare();
  h.req.params.id = 'case-a';
  h.req.body = { provider: connector, operation: 'sync', code: 'FAILED', retryable: true };
  await h.route('POST', '/cases/:id/connector-failures')(h.req, h.res);
  assert.equal(h.res.statusCode, 409);
  assert.equal(h.res.body.error, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
});
