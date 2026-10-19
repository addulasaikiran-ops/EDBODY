# EDBODY Technical Roadmap

**Status:** Adopted architecture; implementation is staged.  
**Audience:** EDBODY contributors and research collaborators.

## Architecture decisions

EDBODY will evolve from the existing desktop prototype. We will not rewrite the frontend or deploy every planned component at once. Each technology enters when a concrete milestone needs it, and each milestone must have software tests and scientific acceptance criteria.

| Concern | Adopted direction | When it enters |
|---|---|---|
| Desktop UI | Keep Electron, React, TypeScript and Vite | Existing application |
| Generic/reference anatomy | Keep Three.js for the current schematic and reference-atlas scene | Existing application; label reference anatomy clearly |
| Scientific/API layer | Python with FastAPI; Pydantic request/response schemas; NumPy and SciPy for appropriate numerical work | Start with the tested API scaffold |
| Python tests | pytest and FastAPI TestClient/HTTPX | Backend scaffold onward |
| Patient and experiment metadata | PostgreSQL, with versioned schemas/migrations and authorization-aware access | After the record, identity, consent and audit model is specified |
| Large scans and derived images | Institution-controlled file/object storage separate from relational metadata | Imaging workflow milestone |
| Medical-image standards | DICOM/DICOMweb for imaging workflows; preserve image geometry, orientation, spacing, units and provenance | Before patient-scan ingestion |
| Imaging tools | SimpleITK and NiBabel for appropriate image operations and NIfTI handling; Orthanc as an optional DICOM archive/service for institutions | Imaging workflow milestone; no mandatory installation for the current desktop demo |
| Medical volume and mask rendering | Add vtk.js for medical volumes and segmentation when the scan-to-viewer path is implemented; retain Three.js for the existing reference anatomy scene | After geometry-aware import exists |
| Health-data exchange | HL7 FHIR, using the target institution's agreed release, profiles and implementation guide | Interoperability planning; do not assume one universal hospital configuration |
| ML | PyTorch only for a defined research question where a learned model is justified | Later, model-specific work |
| Model/experiment tracking | MLflow after there are versioned experiments or trained models to track | Later, when needed |
| Deployment | Docker Compose for reproducible local/institutional development and a small service deployment | When API + storage are ready |
| Tests | Node's built-in test runner for current frontend logic, pytest for Python, then desktop smoke/E2E and imaging-fixture tests | Incrementally, in CI |
| Model validation | Independently specified test datasets, baselines, calibration/error metrics, uncertainty characterization and domain-expert review | Before any model is described as validated |

## Service boundaries

1. **Desktop client:** renders the workspace, provides user interactions and uses only a narrow, validated Electron preload bridge.
2. **Research API:** owns typed request/response contracts and scientific-computation orchestration. It must not silently convert missing inputs into predictions.
3. **Data layer (future):** stores structured metadata, provenance, consent/authorization references and audit records in PostgreSQL; binary imaging objects live in controlled file/object storage.
4. **Imaging layer (future):** preserves the mapping from voxel indices to patient physical coordinates and tracks image/mask provenance. A segmentation result is not, by itself, a physiological model.
5. **Model adapters (future):** each model declares intended use, version, inputs, units, assumptions, evidence, validation status, limits and uncertainty. The registry must distinguish demo, research, validated and unavailable states.

The current FastAPI scaffold is not yet launched by Electron and is not connected to patient storage, DICOM, PostgreSQL, or any physiological model. Keep that separation explicit until integration is implemented and tested.

## Delivery sequence and acceptance gates

### M0 — Prototype baseline

- Node unit tests and multi-platform packaging run in CI.
- Complete the documented desktop smoke-test checklist on a real supported computer.
- Keep the meal-response curve labelled illustrative and not validated.

**Status:** Automated tests and packaging passed in CI. Hands-on desktop launch and optional integration checks still require runtime testing.

### M1 — Backend foundation

- Add a minimal FastAPI service with a health endpoint and a versioned API identity.
- Run pytest in CI separately from the Electron packaging job.
- Explicitly report that patient-data features and validated clinical models are unavailable.
- Do not start the API automatically from Electron yet.

**Acceptance:** Python tests pass in CI, desktop packaging remains green, and the service does not accept or persist patient data.

### M2 — Typed scientific-data contracts

- Define versioned Pydantic schemas for observations, units, timestamps, source/provenance, missingness, quality status and consent/authorization references.
- Add synthetic fixtures and validation tests for missing, malformed, ambiguous and out-of-range inputs.
- Record data provenance rather than silently guessing units or dates.

**Implementation in this change:** `ObservationV1` is a strict, local-only contract for numeric observations, with synthetic examples for a measured value and explicit missingness. Validation covers timezone-aware timestamps, required units, non-finite and out-of-envelope numeric values, quality notes, schema versioning, unknown fields and provenance lineage. See [Scientific Data Contracts](SCIENTIFIC-DATA-CONTRACTS.md).

**Boundary:** the schema is not exposed as an HTTP endpoint, is not connected to Electron or storage, and does not verify that referenced consent or authorization records exist or are valid. The numeric envelope is a serialization guard, not a physiological limit.

### M3 — Security and governed persistence

- Threat-model the system and define data classification, retention/deletion, backup, key management and institution-specific governance.
- Implement authentication, authorization/roles, consent/permission checks, encryption where applicable, and append-only audit events.
- Introduce PostgreSQL migrations only after the schema and access model are reviewed.
- Keep synthetic/de-identified data in development and test workflows.

**Foundation implemented in this change:** first-pass threat model and data classifications; an OIDC JWT access-token verifier with fixed RS256, JWKS signature verification, issuer/audience/expiry and RFC 9068 access-token-type checks; an authenticated self-session route; reusable fail-closed FastAPI authorization dependency; role/action policy evaluator and versioned consent-grant contract; immutable audit-event contract; and synthetic tests for invalid tokens, consent decisions, audit failures and API route boundaries. See [Authentication and Authorization](AUTHENTICATION-AUTHORIZATION.md) and [Security, Privacy and Governance Baseline](SECURITY-PRIVACY-GOVERNANCE.md).

**Remaining before M3 acceptance:** select and configure a target institution's identity provider and verify the desktop flow against it; attach the authorization dependency to every future protected API/storage path; implement authoritative consent persistence and revocation handling; implement a durable tamper-evident audit sink; encryption/key lifecycle controls; retention/deletion and backup/restore workflows; storage integration tests; and institutional security/privacy review. No patient-data endpoint or database is added in this change.

**Gate:** no real patient data until institutional authorization and the security/privacy controls have been implemented, integrated, reviewed and accepted.

### M4 — Geometry-preserving imaging pipeline

- Specify supported DICOM and NIfTI inputs and provenance/quality states.
- Add geometry-aware image/mask loading using SimpleITK and/or NiBabel where appropriate.
- Integrate segmentation masks into a medical volume/mesh viewer using vtk.js while preserving physical coordinates.
- Keep the generic reference atlas distinct from patient-specific anatomy; make reviewer confirmation part of the workflow.

**Acceptance:** synthetic and appropriately de-identified test fixtures verify orientation, spacing, coordinate mapping, label mapping, cancellation and failure handling. Clinical interpretation requires a qualified reviewer.

### M5 — Scientific model contract and first evidence-backed experiment

- Pick one narrow research question only after identifying a suitable model, required inputs, intended population and evidence base.
- Specify numerical units, time horizon, parameter sources, missing-data behavior, reproducibility metadata and output schema before UI integration.
- Build tests against known cases and an independently defined reference where available.
- Return "insufficient data/evidence" instead of a numeric prediction when required inputs or evidence are inadequate.

**Gate:** the existing illustrative meal curve is not promoted or calibrated into a clinical model merely because it produces a graph.

### M6 — Model and experiment reproducibility

- Store experiment inputs or governed snapshot identifiers, model/version/configuration, seed where applicable, timestamps, outputs, evidence references, validation status and uncertainty notes.
- Add side-by-side scenarios only when supported by model capability.
- Adopt MLflow if tracking needs justify the added service and operating burden.

### M7 — Institutional interoperability and deployment

- Confirm the institution's selected FHIR version and implementation profiles before building exchange mappings.
- Use Orthanc only when an institution needs a DICOM archive/service; do not require it for every EDBODY installation.
- Use Docker Compose for initial reproducible deployments; defer Kubernetes and service decomposition until actual scale or operational requirements justify them.
- Complete performance, security, governance, and intended-use validation before any clinical deployment claims.

## Security and scientific safeguards

- Follow current Electron security guidance: keep Electron and its dependencies maintained, retain context isolation and renderer sandboxing, keep Node integration disabled in the renderer, validate IPC senders, restrict navigation/window creation, and use a restrictive Content Security Policy.
- Bind a local development API to loopback only. If Electron later launches it, implement authenticated local IPC/API access, controlled lifecycle and port selection, robust shutdown, and packaging tests before release.
- Never treat an anatomical atlas, a segmentation mask, a numerical curve, or an AI-generated explanation as proof of physiological function or clinical validity.
- Make observed values, derived calculations, exploratory estimates and validated predictions visually and programmatically distinct.
- Record uncertainty only when it is supported by a defined method; do not fabricate confidence intervals or confidence scores.
- No unsupported prediction when evidence or required data is missing.
- Use synthetic or appropriately de-identified data during development. Consent, authorization, auditability, retention and deletion controls are release gates before real patient data.

## Official technical references

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security/)
- [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [VTK.js volume rendering](https://kitware.github.io/vtk-js/api/Rendering_Core_Volume.html)
- [HL7 FHIR specification and release directory](https://www.hl7.org/fhir/directory.html)
- [Orthanc documentation](https://orthanc.uclouvain.be/book/)
- [SimpleITK documentation](https://simpleitk.org/)
- [NiBabel documentation](https://nipy.org/nibabel/)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [Docker Compose documentation](https://docs.docker.com/compose/)
- [MLflow tracking documentation](https://mlflow.org/docs/latest/ml/tracking/)
