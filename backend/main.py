import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pipeline import ForensicEngine
import json

app = FastAPI(title="Aegis Intelligence API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from typing import List
from database import execute_query, execute_insert
import json

engine = ForensicEngine()

@app.post("/analyze")
async def analyze_document(files: List[UploadFile] = File(...)):
    """
    Ingests a folder of documents and runs the 8-layer Aegis pipeline using Local ML inference.
    Skips processing if the folder is already in the database.
    """
    if not files:
        return {"error": "No files uploaded."}

    first_filename = files[0].filename
    folder_name = first_filename.split('/')[0] if '/' in first_filename else first_filename.split('.')[0]
    applicant_id = folder_name.replace("_dossier", "")

    query = "SELECT full_response FROM audit_logs WHERE digital_fingerprint = ?"
    existing_log = execute_query(query, (applicant_id,))
    
    if existing_log:
        print(f"Skipping ML Inference. Found {applicant_id} in Database.")
        cached_result = json.loads(existing_log[0]['full_response'])
        if "applicant_name" not in cached_result:
            cached_result["applicant_name"] = applicant_id.replace("_", " ").title()
        return cached_result

    import tempfile
    import shutil
    import os

    file_paths_list = []
    file_names_list = []
    temp_dir = tempfile.mkdtemp()
    
    try:
        for f in files:
            # Handle potential subdirectories in filename
            safe_filename = os.path.basename(f.filename)
            tmp_path = os.path.join(temp_dir, safe_filename)
            with open(tmp_path, "wb") as buffer:
                shutil.copyfileobj(f.file, buffer)
            file_paths_list.append(tmp_path)
            file_names_list.append(f.filename)

        result = engine.run(file_paths_list, file_names_list, applicant_id)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
    result["applicant_name"] = applicant_id.replace("_", " ").title()

    # Insert into audit_logs so future uploads hit the cache
    insert_query = """
        INSERT INTO audit_logs (id, digital_fingerprint, filename, risk_score, risk_band, processed_at, officer, full_response)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    execute_insert(insert_query, (
        result["audit_log_id"],
        applicant_id,
        folder_name,
        result["overall_risk_score"],
        result["risk_band"],
        result["processed_at"],
        "UNDERWRITER_AI",
        json.dumps(result)
    ))

    return result

from database import execute_query

@app.get("/database")
def get_database():
    """Returns all 2000 applicant dossiers from the SQLite database."""
    # We join profiles and audit_logs to get the risk score
    query = """
        SELECT p.digital_fingerprint as applicant_id, p.filename, p.submission_date,
               a.risk_score, a.risk_band, a.officer
        FROM profiles p
        LEFT JOIN audit_logs a ON p.digital_fingerprint = a.digital_fingerprint
        ORDER BY p.submission_date DESC
    """
    rows = execute_query(query)
    return {"members": rows}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
