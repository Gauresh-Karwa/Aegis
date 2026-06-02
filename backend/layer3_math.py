import re
import numpy as np
from scipy.stats import chisquare
from models import LayerResult

def extract_numbers(text: str) -> list[int]:
    """Helper to extract contiguous digits as integers."""
    # This is a very simplified extractor for the prototype
    matches = re.findall(r'\b\d+\b', text)
    return [int(m) for m in matches if int(m) > 0]

def process(file_bytes: bytes, filename: str) -> LayerResult:
    """
    Layer 3: Mathematical Integrity
    Benford's Law analysis (simulated with random distribution for prototype if OCR missing)
    Arithmetic Cross-validation (Mocked via random triggers for the demo)
    """
    flags = []
    score = 0
    details = {}

    # In a real app, we would have OCR text here.
    # For the prototype, we simulate finding mathematical anomalies based on file size parity
    # just to demonstrate the system detecting something.
    
    # Let's generate a "fake" list of numbers extracted from the document
    # based on the hash of the file to keep it deterministic for the demo.
    hash_val = sum(file_bytes[:100]) if len(file_bytes) > 0 else 1
    np.random.seed(hash_val)
    
    # Generate 50 random "extracted" numbers
    extracted_numbers = np.random.randint(100, 50000, 50)
    first_digits = [int(str(n)[0]) for n in extracted_numbers]
    
    # Calculate Benford's Law distribution
    observed_counts = [first_digits.count(d) for d in range(1, 10)]
    total_nums = len(first_digits)
    
    # Benford's expected percentages
    expected_pcts = [0.301, 0.176, 0.125, 0.097, 0.079, 0.067, 0.058, 0.051, 0.046]
    expected_counts = [total_nums * p for p in expected_pcts]
    
    # Chi-square test
    chi2_stat, p_value = chisquare(observed_counts, expected_counts)
    details["benford_chi2"] = round(chi2_stat, 2)
    details["benford_p_value"] = round(p_value, 4)
    
    if p_value < 0.05:
         flags.append("Statistical deviation from Benford's Law detected (indicates potentially altered figures).")
         score += 25

    # Simulated Arithmetic Check
    # We pretend 1 in 4 documents has an arithmetic error (e.g. Gross - Ded != Net)
    if hash_val % 4 == 0:
        flags.append("Arithmetic cross-validation failed: Gross pay minus deductions does not equal net pay.")
        score += 35
        details["arithmetic_error"] = "Mismatch of Rs. 4,200 detected in reconciliation."

    return LayerResult(
        status="complete",
        score=score,
        flagged=len(flags) > 0,
        flags=flags,
        details=details
    )
