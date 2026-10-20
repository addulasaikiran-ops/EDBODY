# EDBODY security, privacy and governance baseline (M3)

**Status:** Policy and authorization foundation only. This is not a security certification and does not permit real patient data.

## Current boundary

EDBODY has a hardened Electron renderer boundary, an OIDC JWT access-token verifier, a protected self-session route, a configurable Electron system-browser Authorization Code + PKCE flow, typed synthetic observation contracts, and a reusable FastAPI dependency that composes role/consent checks with required audit writes. **No actual identity provider has been configured or verified**, and the sign-in flow has not yet been integration-tested against an institution. The reusable protected-route dependency is not attached to any patient-data endpoint. There is no database, authoritative consent store, encryption key service, or durable append-only audit sink.

**Do not put real patient data into EDBODY.** No user or institution has completed a security/privacy review through this change. Passing tests is not proof of legal, regulatory, or clinical compliance.

## Assets and data classifications

| Class | Examples | Required handling |
|---|---|---|
| Public | Source code, public documentation, public dependency metadata | May be public after normal review; never include secrets |
| Internal / synthetic | Demo profile, synthetic fixtures, test output | Use fabricated identities and values; do not copy from real records |
| Sensitive health data | Patient identifiers, clinical observations, medical history, scans, segmentations, experiment inputs and outputs that can be linked to a person | Not accepted or persisted by the current prototype; future use requires institution-approved access, storage, retention, and review controls |
| Restricted secrets | Credentials, session tokens, signing/encryption keys, recovery codes | Never commit to the repository, include in logs, or expose to renderer JavaScript |

Hashing or replacing names alone does not guarantee de-identification. A future data workflow must consider identifiers embedded in DICOM metadata, filenames, free text, image pixels, exports, logs, crash reports, caches and backups.

## Threat model: first pass

Trust boundaries in scope include the Electron renderer and preload bridge, the Electron main process, local processes that can reach a loopback API, future API clients, identity/consent sources, filesystem or database storage, imaging/model processes, operators, and backup/export destinations.

| Threat | Impact | Existing or required control |
|---|---|---|
| Untrusted navigation or renderer content invokes privileged desktop functions | Local file access or command misuse | Existing navigation, popup, CSP and trusted IPC sender checks; continue security regression tests |
| Another local process calls the loopback API | Unauthorized data access | `/health` is public; `/v1/security/session` requires a configured, verified access token; no patient-data route exists yet. Every future protected route must enforce per-request authorization |
| Role claims or consent fields are supplied by the requester | Privilege escalation or fabricated permission | Session identity is derived from a verified configured JWT access token; future grants must be loaded from a trusted server-side repository, never caller-authored proof |
| Stale, revoked, wrong-subject or wrong-purpose consent is accepted | Access beyond the intended grant | Added deterministic policy evaluator and reusable FastAPI dependency; a real protected route still requires an authoritative grant source and reviewed role policy |
| Audit records can be edited or disappear | Inability to investigate access or misuse | Added immutable event contract only; durable append-only/tamper-evident sink and fail-closed integration remain unimplemented |
| Sensitive identifiers or values leak through logs, temporary files, exports or backups | Privacy breach | Do not store real data in prototype; design minimization, redaction, retention and deletion before ingestion |
| Database/file backup or key is stolen | Bulk disclosure | Storage and key management are not implemented; future deployment must define encryption, access separation, rotation, restore tests and key recovery |
| Dependency/build compromise | Code execution or data exposure | Locked Node dependencies and CI exist; ongoing audit, Python dependency review, provenance and release review remain required |
| Consent is revoked during a long-running export or experiment | A stale authorization remains in effect | Future protected operations must check grants at access time and define cancellation/revocation behavior for in-flight operations |

This is an initial threat model for architecture planning, not a completed penetration test. A threat review with the deploying institution must update it before storing or processing real health information.

## Authorization model added in this change

The policy module `edbody_backend.governance` introduces:

- An opaque principal reference and explicit role set. `edbody_backend.auth` now constructs this principal only after validating a configured RS256 JWT access token against its trusted JWKS, issuer, API audience, expiry and required claims. The token must use the RFC 9068 `at+jwt` type. This verifies access tokens but does not implement interactive login or configure the institution's identity provider.
- A versioned consent-grant contract that names the subject, explicit allowed actions and purposes, effective time, optional expiry and revocation state.
- A deterministic `evaluate_access` function. It denies when no grant exists, the subject does not match, consent is not active/effective, the grant has expired, the action or purpose is outside the grant, or the assigned role does not permit the action.
- An aware evaluation clock; naive timestamps and epoch-number inputs for consent timestamps are rejected.

The proposed example role rules are conservative defaults for testing, not a universal clinical policy:

| Role | Proposed actions |
|---|---|
| Clinician | Read observations and imaging, write observations, run experiments |
| Researcher | Read observations and imaging, run experiments |
| Data steward | Read observations and imaging, write observations, export data |

Even an otherwise permitted role requires an active, subject-matched grant explicitly covering both action and purpose. No administrator bypass, emergency “break glass” path, cross-subject access, consent management UI, or institutional override is implemented. The institution must review and configure the actual role model before use.

## Audit contract added in this change

`edbody_backend.audit.AccessAuditEvent` is an immutable schema for recording a decision: event and request IDs, actor, subject, action, purpose, allow/deny result, reason, policy version and optional resource/consent references. It rejects contradictory decision/reason combinations and requires a consent reference for an allowed access event.

The event contract is **not an audit log**. A reusable route dependency now attempts to append an allow/deny event before it lets a protected handler run, and it fails closed if the sink is unavailable. No durable persistence sink is implemented. Before protected operations exist, implement a durable append-only sink with tamper evidence and access separation; record denies as well as allows; avoid including full observation values, credentials, raw request bodies or direct identifiers unless explicitly justified; and define how the request behaves if the audit write fails. Auditing must not be represented as successful when its event was not durably recorded.

## Data lifecycle requirements before persistence

1. **Purpose and minimization:** state the intended purpose and only collect the minimum fields needed for it.
2. **Identity and access:** select the institution's identity source; validate identities, role provenance, session expiry and revocation; authorize every protected action for the specific subject and purpose.
3. **Consent and legal basis:** define who may grant, view, revoke and manage consent, supported scopes, proxy/guardian scenarios if relevant, and how revocation affects data use and ongoing jobs. A UUID reference alone proves nothing.
4. **Storage:** review schema and access control first; use PostgreSQL for structured metadata only after migrations and authorization are reviewed. Keep scans and derived files in separately controlled storage with path/object access checks.
5. **Encryption and keys:** document encryption in transit and at rest where applicable, key ownership, rotation, backup, recovery and role separation. Do not invent a shared key or hard-code a secret.
6. **Audit and monitoring:** persist immutable allow/deny events, monitor audit-sink failures and suspicious access, restrict audit-reader roles, and avoid recording health payloads in logs.
7. **Retention and deletion:** define institutional retention schedules, deletion workflow including derivatives/exports and backup expiry, legal holds, and verifiable deletion evidence before accepting records.
8. **Backup and recovery:** define encrypted backups, access separation, restore tests, recovery objectives and incident procedures.
9. **Development and test:** use fabricated synthetic examples; if de-identified data is later approved, document the approved method and permitted environment.
10. **Review and operations:** complete a deployment-specific threat review, dependency/security review, incident-response plan, operator access review, and documented acceptance by the responsible institution.

Applicable institutional policies and laws must be determined with the responsible organization and qualified advisors; this document does not claim compliance with any jurisdiction.

## Tests and acceptance gates

The tests cover allowed and denied policy decisions, missing/inactive/revoked/future/expired grants, subject mismatch, role restrictions, action/purpose scope, timestamp handling, JWT signature/issuer/audience/expiry/type and claim validation, desktop PKCE/nonce/state/token boundary helpers, protected session behavior, FastAPI authorization dependency integration, audit-sink failure, grant lifecycle consistency, and immutable audit-event structure. The HTTP API still exposes no patient-data route.

Before M3 can be considered complete, EDBODY still needs a configured and institution-approved identity provider plus live integration tests; policy enforcement on every future protected route and storage access; an authoritative consent/grant store with revocation semantics; a durable tamper-evident audit sink; secrets/key handling; retention/deletion and backup controls; integration tests against the selected identity provider and storage adapters; a reviewed threat model; and a security/privacy acceptance review.

**Release gate:** no real patient data until these controls are implemented, integrated, independently reviewed and accepted for the target institutional deployment.
