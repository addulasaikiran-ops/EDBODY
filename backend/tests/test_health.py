from fastapi.testclient import TestClient

from edbody_backend.auth import get_current_principal
from edbody_backend.governance import AccessPrincipal
from edbody_backend.main import app


client = TestClient(app)


def test_health_endpoint_reports_service_identity() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "edbody-research-backend",
        "api_version": "v1",
        "patient_data_enabled": False,
        "validated_clinical_models_available": False,
    }


def test_openapi_schema_is_available_for_contract_review() -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert schema["info"]["title"] == "EDBODY Research API"
    assert set(schema["paths"]) == {"/health", "/v1/security/session"}  # No patient-data routes are exposed.



def test_security_session_requires_bearer_token() -> None:
    response = client.get("/v1/security/session")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_security_session_fails_closed_when_oidc_is_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("EDBODY_OIDC_ISSUER", raising=False)
    monkeypatch.delenv("EDBODY_OIDC_AUDIENCE", raising=False)
    monkeypatch.delenv("EDBODY_OIDC_JWKS_URL", raising=False)

    response = client.get(
        "/v1/security/session",
        headers={"Authorization": "Bearer syntactically-present-token"},
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "authentication_not_configured"


def test_security_session_returns_only_the_authenticated_callers_roles() -> None:
    app.dependency_overrides[get_current_principal] = lambda: AccessPrincipal(
        principal_reference="https://identity.example.test|synthetic-user",
        roles=("researcher",),
    )
    try:
        response = client.get(
            "/v1/security/session",
            headers={"Authorization": "Bearer test-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "roles": ["researcher"]}
