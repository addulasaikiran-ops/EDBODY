"""Minimal EDBODY API foundation; no patient data or clinical predictions."""
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: Literal["edbody-research-backend"]
    api_version: Literal["v1"]
    patient_data_enabled: Literal[False]
    validated_clinical_models_available: Literal[False]


app = FastAPI(
    title="EDBODY Research API",
    version="0.1.0",
    description=(
        "Initial service scaffold only. No patient records or validated "
        "clinical models are exposed by this API."
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
