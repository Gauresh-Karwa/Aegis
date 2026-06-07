import os
import json
import sqlite3
from glob import glob
from datetime import datetime
import uuid

DB_PATH = os.path.join(os.path.dirname(__file__), "aegis.db")
DATASET_PATH = os.path.join(os.path.dirname(__file__), "aegis dataset", "realistic document")

def ingest():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Wipe existing data
    cursor.execute("DELETE FROM profiles")
    cursor.execute("DELETE FROM audit_logs")
    conn.commit()

    print(f"Wiped existing data from {DB_PATH}")

    folders = glob(os.path.join(DATASET_PATH, "*", "*"))
    
    count = 0
    for folder in folders:
        manifest_path = os.path.join(folder, "manifest.json")
        if not os.path.exists(manifest_path):
            continue
            
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
            
        app_id = manifest.get("applicant_id", str(uuid.uuid4()))
        is_risked = 1 if "risked" in folder else 0
        score = 85 if is_risked else 15
        band = "HIGH" if is_risked else "LOW"
        
        # We simulate that the dossier was submitted today
        today_str = datetime.now().isoformat()
        
        # Insert into profiles
        cursor.execute("""
            INSERT OR REPLACE INTO profiles (digital_fingerprint, filename, doc_type, submission_date, is_verified)
            VALUES (?, ?, ?, ?, ?)
        """, (app_id, f"{app_id}_dossier", "Dossier", today_str, 1))

        # Insert a dummy audit log based on the ground truth
        audit_id = str(uuid.uuid4())
        full_res = json.dumps({
            "applicant_name": manifest.get("name", "Unknown"),
            "fraud_flags": manifest.get("fraud_flags", []),
            "metadata": manifest
        })

        cursor.execute("""
            INSERT OR REPLACE INTO audit_logs (id, digital_fingerprint, filename, risk_score, risk_band, processed_at, officer, full_response)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (audit_id, app_id, f"{app_id}_dossier", score, band, today_str, "SYSTEM_INGEST", full_res))

        count += 1
        
    conn.commit()
    conn.close()
    print(f"Successfully ingested {count} applicant dossiers into the database.")

if __name__ == "__main__":
    ingest()
