from models import LayerResult
from database import execute_insert
import uuid
import json
from datetime import datetime
from typing import Dict, Any

def process(
    filename: str, 
    fingerprint: str, 
    final_score: int, 
    risk_band: str, 
    all_layers: Dict[str, LayerResult]
) -> LayerResult:
    """
    Layer 8: Audit and Compliance
    Writes a tamper-proof log to the database.
    """
    log_id = str(uuid.uuid4())
    processed_at = datetime.now().isoformat()
    
    try:
        # Convert all layers to dict for JSON storage
        layers_dict = {k: v.dict() for k, v in all_layers.items()}
        
        execute_insert(
            """INSERT INTO audit_logs 
               (id, digital_fingerprint, filename, risk_score, risk_band, processed_at, officer, full_response) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                log_id, 
                fingerprint, 
                filename, 
                final_score, 
                risk_band, 
                processed_at, 
                "System_Auto", 
                json.dumps(layers_dict)
            )
        )
        
        return LayerResult(
            status="complete",
            score=0,
            flagged=False,
            flags=[],
            details={
                "audit_log_id": log_id,
                "timestamp": processed_at
            }
        )
    except Exception as e:
        return LayerResult(
            status="error",
            score=0,
            flagged=True,
            flags=[f"Failed to write audit log: {str(e)}"],
            details={"error": str(e)}
        )
