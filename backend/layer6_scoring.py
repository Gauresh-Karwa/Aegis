from models import LayerResult
from typing import Dict

def process(previous_layers: Dict[str, LayerResult]) -> LayerResult:
    """
    Layer 6: Anomaly Scoring
    Aggregates signals from Layers 1-5 into a unified risk score.
    """
    total_score = 0
    flags = []
    
    for layer_name, layer_res in previous_layers.items():
        total_score += layer_res.score
        if layer_res.flagged:
            flags.extend(layer_res.flags)
            
    # Cap score at 100
    final_score = min(total_score, 100)
    
    return LayerResult(
        status="complete",
        score=final_score,
        flagged=final_score >= 40,
        flags=["Risk scoring complete."],
        details={"raw_score": total_score}
    )
