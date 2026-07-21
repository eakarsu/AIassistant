# Production readiness

The governed API at `/api/governance` is the supported grounded ingestion-to-answer assistant path. It records tenant/document-scoped permissions, resumable ingestion checkpoints, parsing and deduplication evidence, index versions, retrieval and faithfulness evaluation, resolved citations, injection tests, abstention, human feedback, radiologist-quality metrics, deletion, and immutable connector history. It never releases an answer or clinical decision automatically.

## Deployment sequence

1. Review and back up the database, then apply `backend/migrations/001_governed_cited_answer.sql` separately using a least-privilege migration identity.
2. Copy `.env.example` to `.env`, replace every placeholder, and configure a unique 32-plus-character JWT secret and explicit CORS allowlist.
3. Install locked dependencies explicitly. `start.sh` only supervises the already-installed backend and frontend.
4. Provision tenant memberships and deploy separately reviewed connector workers. Workers exchange opaque references, versions, digests, and receipts; raw secrets and sensitive content do not enter workflow payloads.
5. Exercise retry, dead-letter, reconciliation, retention/deletion, audit export, backup, restore, and incident-response procedures before production.

Production rejects wildcard CORS, weak secrets, provider/demo flags, generated routes, and startup schema mutation. The additive migration never drops or truncates tables. Legacy destructive database initialization and demo seed SQL require explicit `allow_legacy_reset` or `allow_demo_seed` psql variables and isolated non-production databases. Runtime schema creation was removed from startup.

## Required external validation

Validate repository, object-storage, parser, queue, index, identity, clinical-quality registry, feedback, and notification contracts. Benchmark retrieval recall, faithfulness, citation resolution, freshness, conflicting sources, prompt injection, permission leakage, deletion propagation, latency, cost, and reviewed clinical-quality fixtures. No clinical interpretation or provider call was performed.
