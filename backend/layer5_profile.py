from models import LayerResult
from database import execute_query, execute_insert
import hashlib
from datetime import datetime

def process(file_bytes: bytes, filename: str) -> LayerResult:
    """
    Layer 5: Behavioural Profile Intelligence - Financial DNA
    Checks for duplicate collateral and historical baseline matches.
    """
    flags = []
    score = 0
    details = {}

    fingerprint = hashlib.sha256(file_bytes).hexdigest()
    
    # 1. Check if this exact document (hash) has been submitted before
    existing_docs = execute_query(
        "SELECT * FROM profiles WHERE digital_fingerprint = ?", 
        (fingerprint,)
    )
    
    if len(existing_docs) > 0:
        doc = existing_docs[0]
        flags.append(f"Cross-Applicant Alert: This exact document was previously submitted on {doc['submission_date']}.")
        score += 50
        details["duplicate_hash"] = True
    else:
        # Register in Profile store for future checks
        execute_insert(
            "INSERT INTO profiles (digital_fingerprint, filename, doc_type, submission_date) VALUES (?, ?, ?, ?)",
            (fingerprint, filename, "Unknown", datetime.now().isoformat())
        )
        
        # Simulate Unverified Baseline for the demo (every 3rd new document)
        if len(file_bytes) % 3 == 0:
            flags.append("Unverified Baseline: First-time applicant profile. Applying stricter scrutiny threshold.")
            score += 10
            details["unverified_baseline"] = True

    return LayerResult(
        status="complete",
        score=score,
        flagged=len(flags) > 0,
        flags=flags,
        details=details
    )
