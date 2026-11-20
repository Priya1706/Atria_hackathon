import sqlite3
from typing import Optional
from backend.app.config import DATABASE_PATH


def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """
    Creates and returns an active SQLite connection configured with:
    - Row factory enabled for dictionary-like column access
    - Foreign keys enforced
    """
    path = db_path if db_path is not None else DATABASE_PATH
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn
