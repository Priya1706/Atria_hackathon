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


def _positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError as exc:
        raise ValueError(f"{name} must be a positive integer") from exc
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


STALE_TELEMETRY_SECONDS = _positive_int_env("STALE_TELEMETRY_SECONDS", 120)
ANOMALY_COOLDOWN_SECONDS = _positive_int_env("ANOMALY_COOLDOWN_SECONDS", 300)
CORRELATION_WINDOW_SECONDS = _positive_int_env("CORRELATION_WINDOW_SECONDS", 600)
ANOMALY_BASELINE_WINDOW_SECONDS = _positive_int_env("ANOMALY_BASELINE_WINDOW_SECONDS", 3600)
INCIDENT_RECOVERY_WINDOW_SECONDS = _positive_int_env("INCIDENT_RECOVERY_WINDOW_SECONDS", 300)
