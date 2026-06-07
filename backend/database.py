import sqlite3
import json
from datetime import datetime
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "aegis.db")

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

# Initialize on module load
init_db()
