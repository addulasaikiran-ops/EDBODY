from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet

from edbody_backend.audit import AccessAuditEvent
from edbody_backend.governance import ConsentGrant
from edbody_backend.storage import SQLiteGovernanceStore


def make_grant(*, status="active", consent_id=None, subject_id=None, recorded_at=None):
    now = datetime.now(timezone.utc)
    return ConsentGrant(
        consent_reference=consent_id or uuid4(),
        subject_reference=subject_id or uuid4(),
        status=status,
        permitted_actions=("read_observation",),
        permitted_purposes=("research",),
        effective_at=now - timedelta(minutes=1),
        expires_at=None,
        revoked_at=now if status == "revoked" else None,
        recorded_at=recorded_at or now,
        recorded_by_reference=uuid4(),
    )


def make_event():
    return AccessAuditEvent(
        event_reference=uuid4(),
        occurred_at=datetime.now(timezone.utc).isoformat(),
        request_reference=uuid4(),
        actor_reference="https://issuer.example|synthetic-user",
        subject_reference=uuid4(),
        action="read_observation",
        purpose="research",
        decision="deny",
        reason="missing_consent",
    )


def test_consent_grant_is_persisted_encrypted_and_retrievable(tmp_path: Path):
    key = Fernet.generate_key()
    store = SQLiteGovernanceStore(tmp_path / "governance.sqlite3", key)
    subject = uuid4()
    grant = make_grant(subject_id=subject)
    store.record_grant(grant)

    loaded = store.get_effective_grant(subject_reference=subject, now=datetime.now(timezone.utc))
    assert loaded is not None
    assert loaded.consent_reference == grant.consent_reference
    assert loaded.subject_reference == subject

    raw_db = (tmp_path / "governance.sqlite3").read_bytes()
    assert str(subject).encode() not in raw_db
    assert b"read_observation" not in raw_db


def test_newer_revocation_supersedes_active_grant(tmp_path: Path):
    store = SQLiteGovernanceStore(tmp_path / "governance.sqlite3", Fernet.generate_key())
    subject, consent_id = uuid4(), uuid4()
    now = datetime.now(timezone.utc)
    store.record_grant(make_grant(subject_id=subject, consent_id=consent_id, recorded_at=now - timedelta(seconds=2)))
    store.record_grant(make_grant(status="revoked", subject_id=subject, consent_id=consent_id, recorded_at=now))
    assert store.get_effective_grant(subject_reference=subject, now=now) is None


def test_audit_events_are_durable_chain_verified_and_immutable(tmp_path: Path):
    db = tmp_path / "governance.sqlite3"
    key = Fernet.generate_key()
    store = SQLiteGovernanceStore(db, key)
    store.append(make_event())
    store.append(make_event())
    assert store.audit_count() == 2
    assert store.verify_audit_chain()

    import sqlite3
    with sqlite3.connect(db) as conn:
        with pytest.raises(sqlite3.IntegrityError, match="immutable"):
            conn.execute("DELETE FROM access_audit")
        with pytest.raises(sqlite3.IntegrityError, match="immutable"):
            conn.execute("UPDATE access_audit SET event_hash = 'tampered'")

    assert store.audit_count() == 2
    assert store.verify_audit_chain()


def test_wrong_key_cannot_decrypt_consent(tmp_path: Path):
    db = tmp_path / "governance.sqlite3"
    store = SQLiteGovernanceStore(db, Fernet.generate_key())
    subject = uuid4()
    store.record_grant(make_grant(subject_id=subject))
    wrong_key_store = SQLiteGovernanceStore(db, Fernet.generate_key())
    from edbody_backend.storage import StorageIntegrityError
    with pytest.raises(StorageIntegrityError):
        wrong_key_store.get_effective_grant(subject_reference=subject, now=datetime.now(timezone.utc))
