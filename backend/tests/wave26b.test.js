const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../wave26b');
test('csv quoting preserves commas and zero', () => { const csv = W.toCsv([{a:'x,y',n:0}]); assert.ok(csv.includes('"x,y"')); assert.ok(csv.endsWith(',0') || csv.includes(',0')); });
test('provider gate requires a real key', () => { assert.equal(W.providerConfigured({}), false); assert.equal(W.providerConfigured({OPENAI_API_KEY:'k'}), true); assert.equal(W.providerConfigured({OPENROUTER_API_KEY:'your_openrouter_api_key_here'}), false); });
test('formatValue preserves false/0/empty', () => { assert.equal(W.formatValue(false),'false'); assert.equal(W.formatValue(0),'0'); assert.equal(W.formatValue(''),'(empty)'); });
test('domain fallback is labelled and preserves values', () => { const r = W.cohortSummary([{gender:'F'},{gender:''}]); assert.equal(r.aiGenerated, false); assert.equal(r.source, 'deterministic-fallback'); assert.equal(r.sections.find(s=>s.label==='Patients reviewed').value, 2); assert.equal(W.cohortSummary([]).sections[0].value, 0); });
