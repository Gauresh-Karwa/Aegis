from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal

class LayerResponse(BaseModel):
    layer_name: str
    status: Literal['Passed', 'Flagged', 'Skipped', 'Pending', 'Checking']
    severity: str
    human_explanation: str

class AnalysisResponse(BaseModel):
    document_id: str
    filename: str
    digital_fingerprint: str
    overall_risk_score: int
    risk_band: str
    layers: List[LayerResponse]
    all_flags: List[str]
    plain_language_summary: str
    audit_log_id: str
    processed_at: str
    cross_verification_map: List[Dict[str, str]] = []
    collateral_valuation: Dict[str, Any] = {}
