"""Encrypted SQLite persistence for consent grants and append-only audit events.

This is a local-development adapter, not a substitute for institution-managed
database isolation, KMS/HSM key management, backups, or security review.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from pathlib import Path
from typing import Any
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken

from .audit import AccessAuditEvent
from .governance import ConsentGrant


class StorageConfigurationError(RuntimeError):
    """Persistent storage is not configured safely."""


class StorageIntegrityError(RuntimeError):
    """Encrypted storage could not be verified or decrypted."""


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


class SQLiteGovernanceStore:
    """Encrypted consent repository and hash-chained append-only audit sink.

    Sensitive grant and audit payloads are encrypted using a Fernet key supplied
    outside the database. Subject UUIDs and audit chain metadata remain visible
    for indexing/integrity checks and should be treated as sensitive metadata.
    """

    def __init__(self, database_path: str | Path, encryption_key: str | bytes):
        self.path = Path(database_path).expanduser().resolve()
        try:
            key = encryption_key.encode("ascii") if isinstance(encryption_key, str) else encryption_key
            self._fernet = Fernet(key)
        except Exception as exc:
            raise StorageConfigurationError("EDBODY_STORAGE_KEY must be a valid Fernet key") from exc
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    @classmethod
    def from_environment(cls) -> "SQLiteGovernanceStore":
        path = os.environ.get("EDBODY_STORAGE_PATH", "").strip()
        key = os.environ.get("EDBODY_STORAGE_KEY", "").strip()
        if not path or not key:
            raise StorageConfigurationError("persistent consent/audit storage is not configured")
        return cls(path, key)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.path), timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        return conn

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS consent_grants (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    consent_reference TEXT NOT NULL,
                    subject_reference TEXT NOT NULL,
                    recorded_at TEXT NOT NULL,
                    encrypted_payload BLOB NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_consent_subject
                    ON consent_grants(subject_reference, sequence DESC);

                CREATE TABLE IF NOT EXISTS access_audit (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_reference TEXT NOT NULL UNIQUE,
                    occurred_at TEXT NOT NULL,
                    previous_hash TEXT NOT NULL,
                    event_hash TEXT NOT NULL UNIQUE,
                    encrypted_payload BLOB NOT NULL
                );

                CREATE TRIGGER IF NOT EXISTS access_audit_no_update
                BEFORE UPDATE ON access_audit
                BEGIN SELECT RAISE(ABORT, 'audit records are immutable'); END;

                CREATE TRIGGER IF NOT EXISTS access_audit_no_delete
                BEFORE DELETE ON access_audit
                BEGIN SELECT RAISE(ABORT, 'audit records are immutable'); END;
                """
            )
        # Best-effort owner-only permissions on POSIX. Windows ACLs must be
        # restricted by the deployment/operator separately.
        if os.name == "posix":
            os.chmod(self.path, 0o600)
            for suffix in ("-wal", "-shm"):
                sidecar = Path(str(self.path) + suffix)
                if sidecar.exists():
                    os.chmod(sidecar, 0o600)

    def record_grant(self, grant: ConsentGrant) -> None:
        payload = self._fernet.encrypt(_canonical_json(grant.model_dump(mode="json")))
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """INSERT INTO consent_grants
                   (consent_reference, subject_reference, recorded_at, encrypted_payload)
                   VALUES (?, ?, ?, ?)""",
                (str(grant.consent_reference), str(grant.subject_reference),
                 grant.recorded_at.isoformat(), payload),
            )
            conn.commit()

    def get_effective_grant(self, *, subject_reference: UUID, now) -> ConsentGrant | None:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT encrypted_payload FROM consent_grants
                   WHERE subject_reference = ? ORDER BY sequence DESC""",
                (str(subject_reference),),
            ).fetchall()
        # Latest record for each consent ID wins, so revocation is effective.
        latest: dict[str, ConsentGrant] = {}
        for row in rows:
            grant = self._decrypt_grant(row["encrypted_payload"])
            latest.setdefault(str(grant.consent_reference), grant)
        candidates = [
            grant for grant in latest.values()
            if grant.status == "active"
            and grant.effective_at <= now
            and (grant.expires_at is None or now < grant.expires_at)
        ]
        if not candidates:
            return None
        return max(candidates, key=lambda grant: grant.recorded_at)

    def _decrypt_grant(self, payload: bytes) -> ConsentGrant:
        try:
            raw = self._fernet.decrypt(payload)
            return ConsentGrant.model_validate_json(raw)
        except (InvalidToken, ValueError) as exc:
            raise StorageIntegrityError("stored consent grant failed integrity/decryption checks") from exc

    def append(self, event: AccessAuditEvent) -> None:
        payload = self._fernet.encrypt(_canonical_json(event.model_dump(mode="json")))
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            previous = conn.execute(
                "SELECT event_hash FROM access_audit ORDER BY sequence DESC LIMIT 1"
            ).fetchone()
            previous_hash = previous["event_hash"] if previous else "0" * 64
            event_hash = hashlib.sha256(
                previous_hash.encode("ascii") + b":" + payload
            ).hexdigest()
            conn.execute(
                """INSERT INTO access_audit
                   (event_reference, occurred_at, previous_hash, event_hash, encrypted_payload)
                   VALUES (?, ?, ?, ?, ?)""",
                (str(event.event_reference), event.occurred_at.isoformat(),
                 previous_hash, event_hash, payload),
            )
            conn.commit()

    def audit_count(self) -> int:
        with self._connect() as conn:
            return int(conn.execute("SELECT COUNT(*) FROM access_audit").fetchone()[0])

    def verify_audit_chain(self) -> bool:
        with self._connect() as conn:
            rows = conn.execute(
                """SELECT previous_hash, event_hash, encrypted_payload
                   FROM access_audit ORDER BY sequence ASC"""
            ).fetchall()
        previous_hash = "0" * 64
        for row in rows:
            if row["previous_hash"] != previous_hash:
                return False
            expected = hashlib.sha256(previous_hash.encode("ascii") + b":" + row["encrypted_payload"]).hexdigest()
            if not hashlib.compare_digest(expected, row["event_hash"]):
                return False
            previous_hash = row["event_hash"]
        return True
