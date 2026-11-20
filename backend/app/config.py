import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent


def _load_root_env_file():
    env_file = PROJECT_ROOT / ".env"
    if not env_file.is_file():
        return
    try:
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
    except OSError:
        return


_load_root_env_file()

APP_ENV = os.getenv("APP_ENV", "development")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
DEFAULT_DB_PATH = str(BASE_DIR / "saas_platform.db")
_configured_db_path = Path(os.getenv("DATABASE_PATH", DEFAULT_DB_PATH))
DATABASE_PATH = str(_configured_db_path if _configured_db_path.is_absolute() else PROJECT_ROOT / _configured_db_path)
