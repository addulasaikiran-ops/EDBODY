"""Minimal EDBODY API foundation; no patient data or clinical predictions."""
from typing import Literal

from fastapi import Depends, FastAPI
from pydantic import BaseModel

from .auth import get_current_principal
from .governance import AccessPrincipal, Role


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["edbody-research-backend"]
    api_version: Literal["v1"]
    patient_data_enabled: Literal[False]
    validated_clinical_models_available: Literal[False]


class SessionResponse(BaseModel):
    authenticated: Literal[True]
    roles: list[Role]


app = FastAPI(
    title="EDBODY Research API",
    version="0.1.0",
    description=(
        "Research API scaffold. Exposes health status and an OIDC-protected "
        "self-session endpoint only. No patient records or validated clinical "
        "models are exposed by this API."
    ),
)


@app.get("/health", response_model=HealthResponse, tags=["operations"])
def health() -> HealthResponse:
    """Report process readiness without making claims about model validity."""
    return HealthResponse(
        status="ok",
        service="edbody-research-backend",
        api_version="v1",
        patient_data_enabled=False,
        validated_clinical_models_available=False,
    )


@app.get("/v1/security/session", response_model=SessionResponse, tags=["security"])
def current_session(
    principal: AccessPrincipal = Depends(get_current_principal),
) -> SessionResponse:
    """Validate the caller's OIDC access token and return only their app roles."""
    return SessionResponse(authenticated=True, roles=list(principal.roles))
