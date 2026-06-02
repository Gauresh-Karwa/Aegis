from models import LayerResult
from typing import Dict, List

def process(previous_layers: Dict[str, LayerResult]) -> LayerResult:
    """
    Layer 7: Explainability and Underwriter Co-Pilot
    Aggregates all flags into a single plain-language summary list.
    """
    all_flags = []
    for layer_name, layer_res in previous_layers.items():
        if layer_res.flagged and layer_res.flags:
            all_flags.extend(layer_res.flags)

    summary = ""
    if not all_flags:
        summary = "Document appears consistent. No significant anomalies detected across all forensic layers."
    else:
        summary = f"Detected {len(all_flags)} potential anomalies requiring underwriter review. See detailed flag list below."

    return LayerResult(
        status="complete",
        score=0,
        flagged=len(all_flags) > 0,
        flags=all_flags,  # Store all flags here for easy retrieval
        details={"summary": summary}
    )
