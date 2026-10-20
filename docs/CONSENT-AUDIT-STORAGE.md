# Consent and audit storage (Step 5 foundation)

**Status:** Encrypted persistent adapters are implemented for consent-grant records and access-decision audit events. No patient-data HTTP routes are added. This is a local-development storage adapter, not a production security certification.

## Configuration

Set these variables in the backend process environment. Keep the encryption key outside source control and do not put it in `.env` files that may be committed.

PowerShell example (generate a new key once and store it in an approved secret manager/password manager; do not generate a new key on every launch):

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
$env:EDBODY_STORAGE_PATH = "$env:LOCALAPPDATA\EDBODY\governance.sqlite3"
$env:EDBODY_STORAGE_KEY = "<paste-the-generated-key-here>"
```

Use a dedicated, access-restricted directory for the database. On POSIX systems, the adapter applies owner-only permissions to the main database file. Windows filesystem ACLs must be configured and verified by the operator. SQLite WAL/SHM sidecar files and backups are also sensitive assets.

The encryption key must remain stable across restarts and be backed up securely. If it is lost, encrypted grant/audit payloads cannot be recovered. If it is exposed, treat stored records as compromised and rotate according to an institution-approved procedure. Do not log the key or payloads.

## What is persisted

- Consent grants are serialized and encrypted before being written to SQLite. Grant revisions are append-only; the newest revision for a consent ID supersedes earlier revisions, so a revocation supersedes an active grant.
- Access-decision audit payloads are encrypted. Events are appended transactionally and linked by a SHA-256 hash chain. SQLite triggers reject normal UPDATE and DELETE statements. `verify_audit_chain()` checks the chain for accidental/tampering changes.
- The database stores subject and consent references plus event timestamps and chain metadata for indexing/integrity. These metadata remain visible and must be treated as sensitive.
- The authorization dependency uses this store for both consent lookup and audit append. If storage is not configured, inaccessible, cannot decrypt a grant, or audit append fails, the protected operation fails closed with HTTP 503. Denied authorization decisions are audited before the API returns HTTP 403.

## Important security boundaries

SQLite triggers and a hash chain are tamper-evident controls for ordinary application use, not a guarantee against an administrator or attacker who can replace the database and drop triggers. The encryption key is supplied by environment configuration, not a KMS/HSM. Production deployments need institution-managed key storage, database/filesystem isolation, backups and restore tests, external or separately administered audit replication, monitoring, key rotation, and security review.

The current app does **not** have a consent-capture UI or a consent-management HTTP endpoint. The repository API is available to trusted server-side code; do not add a public write route until subject identity binding, who may record consent, evidence/provenance, correction/revocation workflows, and the institution's policy are defined and reviewed. No patient-data endpoints should be added until these controls and the relevant institutional review are operational. Do not use real patient data in the prototype.

## Tests

From `backend` with the development dependencies installed:

```powershell
python -m pytest -q
```

The storage tests use synthetic UUIDs and temporary databases. They cover encrypted persistence, revocation supersession, audit-chain verification, immutable SQL updates/deletes, and rejection of a wrong encryption key.
