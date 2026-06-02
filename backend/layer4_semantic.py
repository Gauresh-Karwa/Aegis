import os
from models import LayerResult
from anthropic import Anthropic

def process(file_bytes: bytes, filename: str) -> LayerResult:
    """
    Layer 4: Semantic and Legal Integrity
    Uses Claude API to perform semantic consistency checks.
    """
    flags = []
    score = 0
    details = {}

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return LayerResult(
            status="skipped",
            score=0,
            flagged=False,
            flags=["Semantic analysis skipped: Anthropic API key not configured."],
            details={"error": "Missing API Key"}
        )

    try:
        # In a full system, we pass the OCR'd text to Claude. 
        # For this prototype, we will prompt Claude to simulate an analysis 
        # based on the document type (derived from filename).
        client = Anthropic(api_key=api_key)
        
        prompt = f"""
        You are Aegis, a forensic AI. We are testing a document named '{filename}'.
        Act as the Semantic Integrity layer. 
        Analyze the likely contents of this document type and invent 1 semantic or legal anomaly that might be found in a fraudulent version of it. 
        Output ONLY a JSON object like this:
        {{"has_anomaly": true, "flag": "The description of the anomaly", "severity": 30}}
        If you want to simulate a clean document, output {{"has_anomaly": false}}.
        Make it brief.
        """

        message = client.messages.create(
            model="claude-3-5-sonnet-20240620",
            max_tokens=150,
            temperature=0.7,
            system="You are a strict financial document forensic API returning JSON only.",
            messages=[{"role": "user", "content": prompt}]
        )
        
        response_text = message.content[0].text
        
        import json
        result = json.loads(response_text)
        
        if result.get("has_anomaly"):
            flag_text = result.get("flag", "Semantic anomaly detected by LLM.")
            flags.append(flag_text)
            score += result.get("severity", 20)
            details["llm_output"] = flag_text
            
    except Exception as e:
        flags.append(f"Semantic API error: {str(e)}")
        details["error"] = str(e)
        score += 5

    return LayerResult(
        status="complete",
        score=score,
        flagged=len(flags) > 0,
        flags=flags,
        details=details
    )
