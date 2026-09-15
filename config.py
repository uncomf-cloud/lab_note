"""
Configuration module for lab_note.
Loads environment variables and resolves repository paths.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Server settings
PORT = int(os.getenv("PORT", 8002))
HOST = os.getenv("HOST", "127.0.0.1")

# Target laboratory workspace
_default_lab_path = Path.home() / "Documents" / "Antigravity" / "laboratory"
lab_path_str = os.getenv("LAB_WORKSPACE_PATH", str(_default_lab_path))
LAB_WORKSPACE_PATH = Path(lab_path_str).resolve()

# Projects and protocols directory in laboratory
PROJECTS_DIR = LAB_WORKSPACE_PATH / "projects"
PROTOCOLS_DIR = LAB_WORKSPACE_PATH / "protocols"
SHARED_PROTOCOLS_DIR = LAB_WORKSPACE_PATH / "shared" / "protocols"

def ensure_workspace_dirs() -> None:
    """Ensure that laboratory protocols and projects directories exist."""
    PROTOCOLS_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    SHARED_PROTOCOLS_DIR.mkdir(parents=True, exist_ok=True)

def get_workspace_info() -> dict:
    """Return workspace path status."""
    return {
        "workspace_path": str(LAB_WORKSPACE_PATH),
        "exists": LAB_WORKSPACE_PATH.exists(),
        "projects_dir": str(PROJECTS_DIR),
        "protocols_dir": str(PROTOCOLS_DIR),
        "shared_protocols_dir": str(SHARED_PROTOCOLS_DIR),
        "port": PORT,
        "host": HOST,
    }
