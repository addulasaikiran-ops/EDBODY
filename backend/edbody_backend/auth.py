"""OIDC JWT access-token verification for the EDBODY API.

The backend accepts access tokens signed with RS256 by one explicitly configured
issuer and intended for this API's audience. Roles are read only from a claim
inside the verified token; request bodies and query parameters never supply roles.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Mapping
from urllib.parse import urlparse

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import ValidationError

from .governance import AccessPrincipal, Role

ALLOWED_ROLES: frozenset[Role] = frozenset(
    {"clinician", "researcher", "data_steward"}
)
DEFAULT_ROLE_CLAIM = "roles"
ROLE_CLAIM_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
SUBJECT_MAX_LENGTH = 255
CLOCK_SKEW_SECONDS = 60


class OIDCConfigurationError(ValueError):
    """The trusted identity-provider configuration is missing or unsafe."""


class OIDCUnavailable(RuntimeError):
    """The identity provider's verification keys cannot currently be retrieved."""


class InvalidBearerToken(ValueError):
    """The bearer token is invalid for this API."""


class InvalidIdentityClaims(ValueError):
    """A verified token has malformed subject or role claims."""


@dataclass(frozen=True)
class OIDCSettings:
    issuer: str
    audience: str
    jwks_url: str
    role_claim: str = DEFAULT_ROLE_CLAIM

    @classmethod
    def from_environment(
        cls, environ: Mapping[str, str] | None = None
    ) -> "OIDCSettings":
        env = os.environ if environ is None else environ
        issuer = env.get("EDBODY_OIDC_ISSUER", "").strip()
        audience = env.get("EDBODY_OIDC_AUDIENCE", "").strip()
        jwks_url = env.get("EDBODY_OIDC_JWKS_URL", "").strip()
        role_claim = env.get("EDBODY_OIDC_ROLE_CLAIM", DEFAULT_ROLE_CLAIM).strip()

        missing = [
            name
            for name, value in (
                ("EDBODY_OIDC_ISSUER", issuer),
                ("EDBODY_OIDC_AUDIENCE", audience),
                ("EDBODY_OIDC_JWKS_URL", jwks_url),
            )
            if not value
        ]
        if missing:
            raise OIDCConfigurationError(
                "OIDC authentication is not configured; missing "
                + ", ".join(missing)
            )

        issuer_parts = urlparse(issuer)
        if (
            issuer_parts.scheme != "https"
            or not issuer_parts.netloc
            or issuer_parts.query
            or issuer_parts.fragment
            or issuer_parts.username is not None
            or issuer_parts.password is not None
        ):
            raise OIDCConfigurationError(
                "EDBODY_OIDC_ISSUER must be an HTTPS issuer URL without query or fragment"
            )

        jwks_parts = urlparse(jwks_url)
        if (
            jwks_parts.scheme != "https"
            or not jwks_parts.netloc
            or jwks_parts.query
            or jwks_parts.fragment
            or jwks_parts.username is not None
            or jwks_parts.password is not None
        ):
            raise OIDCConfigurationError(
                "EDBODY_OIDC_JWKS_URL must be an HTTPS URL without query, fragment, or embedded credentials"
            )

        if not ROLE_CLAIM_PATTERN.fullmatch(role_claim):
            raise OIDCConfigurationError(
                "EDBODY_OIDC_ROLE_CLAIM must be one top-level claim name"
            )

        return cls(
            issuer=issuer,
            audience=audience,
            jwks_url=jwks_url,
            role_claim=role_claim,
        )


@lru_cache(maxsize=8)
def _cached_jwks_client(jwks_url: str) -> PyJWKClient:
    # PyJWKClient caches the JWKS document and refreshes it when a key ID is
    # unknown. The URL is trusted deployment configuration, never token input.
    return PyJWKClient(jwks_url, cache_keys=True, timeout=5)


def verify_access_token(
    token: str,
    settings: OIDCSettings,
    *,
    jwks_client: PyJWKClient | None = None,
) -> AccessPrincipal:
    """Verify a signed JWT and derive an EDBODY principal from trusted claims."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise InvalidBearerToken("token header is malformed") from exc

    # RFC 9068's explicit at+jwt type prevents accepting an OIDC ID token
    # as an API bearer token. Header values are still untrusted until the
    # signature is verified; this check is only an early rejection.
    if (
        header.get("typ") not in {"at+jwt", "application/at+jwt"}
        or header.get("alg") != "RS256"
    ):
        raise InvalidBearerToken("token is not a supported JWT access token")

    client = jwks_client or _cached_jwks_client(settings.jwks_url)

    try:
        signing_key = client.get_signing_key_from_jwt(token).key
    except jwt.PyJWKClientConnectionError as exc:
        raise OIDCUnavailable("identity-provider signing keys are unavailable") from exc
    except jwt.PyJWKClientError as exc:
        raise InvalidBearerToken("token signing key could not be resolved") from exc

    try:
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=settings.audience,
            issuer=settings.issuer,
            leeway=CLOCK_SKEW_SECONDS,
            options={"require": ["exp", "iss", "sub", "aud", "iat", "jti", "client_id"]},
        )
    except jwt.InvalidTokenError as exc:
        raise InvalidBearerToken("token validation failed") from exc

    subject = claims.get("sub")
    if (
        not isinstance(subject, str)
        or not subject
        or len(subject) > SUBJECT_MAX_LENGTH
        or subject.strip() != subject
    ):
        raise InvalidIdentityClaims("token subject claim is missing or invalid")
    for claim_name in ("client_id", "jti"):
        claim_value = claims.get(claim_name)
        if not isinstance(claim_value, str) or not claim_value.strip():
            raise InvalidIdentityClaims(f"token {claim_name} claim is missing or invalid")

    raw_roles = claims.get(settings.role_claim, [])
    if not isinstance(raw_roles, list) or any(
        not isinstance(role, str) for role in raw_roles
    ):
        raise InvalidIdentityClaims("configured role claim must be a list of strings")

    # Unknown roles are not mapped into EDBODY permissions. A verified user
    # with no recognized role is authenticated but receives no application access.
    roles = tuple(
        role for role in dict.fromkeys(raw_roles) if role in ALLOWED_ROLES
    )

    # OIDC subject identifiers are unique within an issuer, not globally.
    # Include the configured issuer so two providers cannot collide.
    principal_reference = f"{settings.issuer}|{subject}"
    try:
        return AccessPrincipal(
            principal_reference=principal_reference,
            roles=roles,
        )
    except Exception as exc:
        raise InvalidIdentityClaims("token identity claims are invalid") from exc


_bearer = HTTPBearer(auto_error=False)


def get_current_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AccessPrincipal:
    """FastAPI dependency: fail closed if bearer or IdP verification is unavailable."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "bearer_token_required"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        settings = OIDCSettings.from_environment()
    except OIDCConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "authentication_not_configured"},
        ) from exc

    try:
        return verify_access_token(credentials.credentials, settings)
    except OIDCUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "identity_provider_unavailable"},
        ) from exc
    except (InvalidBearerToken, InvalidIdentityClaims) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_bearer_token"},
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
