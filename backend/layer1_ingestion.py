import hashlib
import mimetypes
from models import LayerResult

def process(file_bytes: bytes, filename: str) -> LayerResult:
    """
    Layer 1: Document Ingestion and Classification
    Calculates SHA-256 and detects basic properties.
    """
    flags = []
    score = 0
    
    # 1. Digital Fingerprint
    fingerprint = hashlib.sha256(file_bytes).hexdigest()
    
    # 2. File Size
    size_kb = len(file_bytes) / 1024
    if size_kb > 15000:  # > 15MB
        flags.append("File size exceeds normal limits for scanned documents.")
        score += 5
        
    # 3. MIME type detection
    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type:
        mime_type = "application/octet-stream"
        
    allowed_types = ["application/pdf", "image/jpeg", "image/png"]
    if mime_type not in allowed_types:
        flags.append(f"Unexpected file type detected: {mime_type}")
        score += 15

    # 4. Basic Document Classification (Mock logic for prototype)
    doc_type = "Unknown"
    lower_name = filename.lower()
    if "salary" in lower_name or "payslip" in lower_name:
        doc_type = "Salary Slip"
    elif "itr" in lower_name or "tax" in lower_name:
        doc_type = "Income Tax Return"
    elif "deed" in lower_name or "land" in lower_name or "property" in lower_name:
        doc_type = "Property Record"
    else:
        doc_type = "Unclassified Document"

    return LayerResult(
        status="complete",
        score=score,
        flagged=len(flags) > 0,
        flags=flags,
        details={
            "fingerprint": fingerprint,
            "size_kb": round(size_kb, 2),
            "mime_type": mime_type,
            "doc_type": doc_type
        }
    )
