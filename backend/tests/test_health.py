from fastapi.testclient import TestClient

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
    assert "/health" in schema["paths"]
