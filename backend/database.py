import sqlite3
import json
from datetime import datetime
import os
from pathlib import Path

DB_PATH = os.path.join(os.path.dirname(__file__), "aegis.db")
DATASET_DIR = Path(__file__).parent / "Aegis dataset" / "realistic document"

def init_db():
    """Initializes the SQLite database with required tables."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Profiles table (Financial DNA)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            digital_fingerprint TEXT PRIMARY KEY,
            filename TEXT,
            doc_type TEXT,
            submission_date TEXT,
            is_verified BOOLEAN DEFAULT 0
        )
    """)

    # Audit log table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            digital_fingerprint TEXT,
            filename TEXT,
            risk_score INTEGER,
            risk_band TEXT,
            processed_at TEXT,
            officer TEXT,
            full_response TEXT
        )
    """)

    # New Systematic Database Integration Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS applicants (
            applicant_id TEXT PRIMARY KEY,
            name TEXT,
            pan TEXT,
            doc_date TEXT,
            class_label TEXT,
            risk_score REAL,
            risk_level TEXT,
            fraud_flags TEXT,
            salary_gross REAL,
            itr_total_income REAL,
            land_value REAL,
            pdf_producer TEXT,
            branch_ifsc TEXT,
            folder_path TEXT
        )
    """)

    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def execute_query(query: str, params: tuple = ()) -> list:
    """Executes a SELECT query and returns the results."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def execute_insert(query: str, params: tuple = ()):
    """Executes an INSERT/UPDATE query."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        conn.commit()

def fetch_all_applicants():
    """Returns all systematically loaded applicants, parsing JSON flags."""
    rows = execute_query("SELECT * FROM applicants")
    for row in rows:
        if "fraud_flags" in row and row["fraud_flags"]:
            try:
                row["fraud_flags"] = json.loads(row["fraud_flags"])
            except:
                row["fraud_flags"] = []
        else:
            row["fraud_flags"] = []
            
        row["class"] = row["class_label"] # Map back for UI consistency
    return rows

def seed_dataset(compute_score_fn, get_level_fn):
    """Systematically seeds the 2000 folders into the SQLite database."""
    # Check if already populated
    existing = execute_query("SELECT COUNT(*) as c FROM applicants")
    if existing and existing[0]['c'] > 0:
        print("Database already populated systematically.")
        return

    print("Systematically scanning and inserting dataset into database...")
    records = []
    for cls in ["safe", "risked"]:
        cls_dir = DATASET_DIR / cls
        if not cls_dir.exists():
            continue
        for folder in sorted(cls_dir.iterdir()):
            manifest_path = folder / "manifest.json"
            if not manifest_path.exists():
                continue
            with open(manifest_path) as f:
                m = json.load(f)
            
            score = compute_score_fn(m)
            level = get_level_fn(score)
            flags = m.get("fraud_flags", [])
            
            records.append((
                m.get("applicant_id"),
                m.get("name"),
                m.get("pan"),
                m.get("doc_date"),
                m.get("class"),
                round(score, 4),
                level,
                json.dumps(flags),
                m.get("salary_gross"),
                m.get("itr_total_income"),
                m.get("land_value"),
                m.get("pdf_producer"),
                m.get("branch_ifsc"),
                str(folder)
            ))
            
            # Batch commit every 100 records to show progressive loading
            if len(records) >= 100:
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.executemany("""
                        INSERT OR IGNORE INTO applicants (
                            applicant_id, name, pan, doc_date, class_label, risk_score, 
                            risk_level, fraud_flags, salary_gross, itr_total_income, 
                            land_value, pdf_producer, branch_ifsc, folder_path
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, records)
                    conn.commit()
                records = []

    if records:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.executemany("""
                INSERT OR IGNORE INTO applicants (
                    applicant_id, name, pan, doc_date, class_label, risk_score, 
                    risk_level, fraud_flags, salary_gross, itr_total_income, 
                    land_value, pdf_producer, branch_ifsc, folder_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, records)
            conn.commit()
        print("Successfully finished inserting dataset records into database.")

# Initialize on module load
init_db()
