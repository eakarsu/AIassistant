# Audit Apply Note — AIassistant (radiology)

## Audit recommendations (from batch_00.md)

The audit reports 0 AI endpoints. **Scanner false-negative.** `backend/routes/aiAnalysis.js` defines:
`/ai-analyze`, `/critical-findings-check`, `/follow-up-recommendations`, `/generate-report`, `/history`, `/incidental-findings`, `/insurance-preauth`, `/patient-portal-summary`, `/prior-study-comparison`, `/qa-audit`, `/report-templating`, `/stream`, `/turnaround-predictor`.

Audit "missing AI" already covered:
- AI image analysis (CAD) → `/ai-analyze` (text findings basis)
- AI report generation → `/generate-report`
- AI QA → `/qa-audit`
- AI workflow optimization → `/critical-findings-check` / `/turnaround-predictor`

### Missing non-AI features
- DICOM viewer
- EHR integration
- Teleradiology

## Implemented in this pass

None. Recommended AI surface already implemented. Remaining items are external integrations or new project surfaces.

## Backlog (not implemented)

| Item | Category | Reason |
|---|---|---|
| DICOM viewer | TOO-RISKY | Heavy frontend lift, DICOM tooling |
| EHR integration | NEEDS-CREDS | Epic/Cerner/HL7 creds + HIPAA review |
| Teleradiology workflow | NEEDS-PRODUCT-DECISION | Workflow design |
| DICOM-based CAD (true imaging) | TOO-RISKY | DICOM ingest + vision pipeline |

## Apply pass 5 (all backlog)

Implemented all four backlog items as additive code (no risk to existing flows).

**Backend** — new file `backend/routes/extensions.js`, mounted under `/api`:
- DICOM viewer registry (TOO-RISKY → additive table + 3 endpoints): `GET/POST /api/dicom-studies`, `GET /api/dicom-studies/:id`. Stores `study_uid`, modality, body part, storage URL, thumbnail, instance count, JSONB meta. PRODUCT-DECISION: native rendering (Cornerstone/OHIF) is a future product call; this pass exposes the catalog so studies can be linked to external viewers.
- DICOM-based CAD advisory (TOO-RISKY → text-grounded, gated): `POST /api/dicom-cad-advisory` returns 503 with `missing: OPENROUTER_API_KEY` if AI key absent.
- EHR integration (NEEDS-CREDS → 503 with `missing: EHR_BASE_URL,EHR_API_KEY`): `GET /api/ehr/status`, `POST /api/ehr/patient-sync`, `POST /api/ehr/order-result-push`, `GET /api/ehr/sync-log`. PRODUCT-DECISION: assumes FHIR R4 Patient/DiagnosticReport resources.
- Teleradiology workflow (NEEDS-PRODUCT-DECISION): priorities = [stat, urgent, routine] with default-SLA hours {1, 4, 24}. Endpoints: `POST/GET /api/teleradiology/assignments`, `PATCH /api/teleradiology/assignments/:id`, `GET /api/teleradiology/queue-stats`.

**Frontend** — new tabbed page `frontend/src/pages/Extensions.js` (DICOM / Teleradiology / EHR), routed at `/extensions`, sidebar entry "Extensions". Uses JWT bearer from `localStorage('token')`, axios, existing CSS classes.

**Pre-existing fixes (additive)**:
- `routes/users.js`: switched `require('bcrypt')` → `require('bcryptjs')` (only `bcryptjs` is installed). Pre-pass-5 startup was broken.

**Smoke test (login → endpoint roundtrip):**
- `POST /api/auth/login admin@radiology.com` → 200
- `GET /api/dicom-studies` → 200
- `GET /api/ehr/status` → 200 (`missing: [EHR_BASE_URL, EHR_API_KEY]`)
- `POST /api/ehr/patient-sync` → 503 (`missing: EHR_BASE_URL,EHR_API_KEY`)
- `POST /api/teleradiology/assignments {priority:'urgent'}` → 200 with `sla_hours: 4`

No new deps, no `npm install`, no heavy ML libraries.

## Apply pass 3 (frontend)

- Verified frontend coverage. `frontend/src/pages/AIHub.js` already surfaces 7 AI tools (report templating, prior study comparison, turnaround predictor, incidental findings, QA audit, insurance pre-auth, patient portal summary) with JWT bearer auth from `localStorage('token')`, per-tool dynamic forms, and toast-based feedback.
- Other AI pages (`Analysis.js`, etc.) cover the remaining endpoints.
- Action: LEFT-AS-IS — no frontend gap to close.
