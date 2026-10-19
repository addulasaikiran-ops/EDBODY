from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from edbody_backend.auth import (
    InvalidBearerToken,
    InvalidIdentityClaims,
    OIDCConfigurationError,
    OIDCSettings,
    verify_access_token,
)

ISSUER = "https://identity.example.test"
AUDIENCE = "edbody-api"
JWKS_URL = "https://identity.example.test/.well-known/jwks.json"


class StaticJwksClient:
    """Test-only stand-in for the remote JWK set; no network requests are made."""

    def __init__(self, public_key: object) -> None:
        self.public_key = public_key

    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        return SimpleNamespace(key=self.public_key)


@pytest.fixture(scope="module")
def signing_keys() -> tuple[object, object]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


@pytest.fixture
def settings() -> OIDCSettings:
    return OIDCSettings(issuer=ISSUER, audience=AUDIENCE, jwks_url=JWKS_URL)


def issue_token(
    private_key: object,
    *,
    issuer: str = ISSUER,
    audience: str = AUDIENCE,
    subject: str = "researcher-123",
    roles: object = None,
    expires_at: datetime | None = None,
    include_expiry: bool = True,
    token_type: str = "at+jwt",
) -> str:
    now = datetime.now(timezone.utc)
    claims: dict[str, object] = {
        "iss": issuer,
        "aud": audience,
        "sub": subject,
        "roles": ["researcher"] if roles is None else roles,
        "iat": int(now.timestamp()),
        "jti": "synthetic-token-id",
        "client_id": "edbody-test-client",
    }
    if include_expiry:
        claims["exp"] = int((expires_at or now + timedelta(minutes=5)).timestamp())
    return jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": "test-signing-key", "typ": token_type},
    )


def test_valid_access_token_creates_principal_from_verified_subject_and_roles(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, roles=["researcher", "unknown-role", "researcher"])

    principal = verify_access_token(
        token, settings, jwks_client=StaticJwksClient(public_key)  # type: ignore[arg-type]
    )

    assert principal.principal_reference == f"{ISSUER}|researcher-123"
    assert principal.roles == ("researcher",)


def test_token_with_wrong_issuer_is_rejected(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, issuer="https://attacker.example.test")

    with pytest.raises(InvalidBearerToken):
        verify_access_token(
            token, settings, jwks_client=StaticJwksClient(public_key)  # type: ignore[arg-type]
        )


def test_token_with_wrong_audience_is_rejected(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, audience="another-api")

    with pytest.raises(InvalidBearerToken):
        verify_access_token(
            token, settings, jwks_client=StaticJwksClient(public_key)  # type: ignore[arg-type]
        )


def test_expired_token_is_rejected(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, expires_at=datetime.now(timezone.utc) - timedelta(minutes=5))

    with pytest.raises(InvalidBearerToken):
        verify_access_token(
            token, settings, jwks_client=StaticJwksClient(public_key)  # type: ignore[arg-type]
        )


def test_expiry_claim_is_required(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, include_expiry=False)

    with pytest.raises(InvalidBearerToken):
        verify_access_token(
            token, settings, jwks_client=StaticJwksClient(public_key)  # type: ignore[arg-type]
        )


def test_wrong_signature_is_rejected(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, _ = signing_keys
    attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = issue_token(attacker_key)

    with pytest.raises(InvalidBearerToken):
        verify_access_token(
            token, settings, jwks_client=StaticJwksClient(private_key.public_key())  # type: ignore[attr-defined,arg-type]
        )


def test_id_token_typ_is_rejected_instead_of_accepted_as_api_bearer(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, token_type="JWT")

    with pytest.raises(InvalidBearerToken, match="not a supported JWT access token"):
        verify_access_token(
            token, settings, jwks_client=StaticJwksClient(public_key)  # type: ignore[arg-type]
        )


def test_malformed_role_claim_is_rejected(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, roles="researcher")

    with pytest.raises(InvalidIdentityClaims, match="list of strings"):
        verify_access_token(
            token, settings, jwks_client=StaticJwksClient(public_key)  # type: ignore[arg-type]
        )


def test_authenticated_identity_with_no_edbody_role_has_no_permissions(
    signing_keys: tuple[object, object], settings: OIDCSettings
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, roles=["some-other-app-role"])

    principal = verify_access_token(
        token, settings, jwks_client=StaticJwksClient(public_key)  # type: ignore[arg-type]
    )

    assert principal.roles == ()


def test_oidc_configuration_requires_all_trusted_endpoints() -> None:
    with pytest.raises(OIDCConfigurationError, match="EDBODY_OIDC_ISSUER"):
        OIDCSettings.from_environment({})


def test_oidc_configuration_rejects_insecure_http_urls() -> None:
    config = {
        "EDBODY_OIDC_ISSUER": "http://identity.example.test",
        "EDBODY_OIDC_AUDIENCE": AUDIENCE,
        "EDBODY_OIDC_JWKS_URL": JWKS_URL,
    }

    with pytest.raises(OIDCConfigurationError, match="must be an HTTPS issuer"):
        OIDCSettings.from_environment(config)


def test_oidc_configuration_rejects_empty_or_invalid_role_claim_name() -> None:
    config = {
        "EDBODY_OIDC_ISSUER": ISSUER,
        "EDBODY_OIDC_AUDIENCE": AUDIENCE,
        "EDBODY_OIDC_JWKS_URL": JWKS_URL,
        "EDBODY_OIDC_ROLE_CLAIM": "roles/../../unsafe",
    }

    with pytest.raises(OIDCConfigurationError, match="top-level claim name"):
        OIDCSettings.from_environment(config)
