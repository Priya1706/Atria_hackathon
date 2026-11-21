"""Small environment-based settings loader, with process environment precedence."""
from dataclasses import dataclass
import os
from pathlib import Path


def _load_dotenv():
    """Read simple KEY=VALUE lines from project .env without overriding OS values."""
    env_file = Path.cwd() / ".env"
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


_load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_path: str = os.getenv("COLLECTOR_DB", "collector.db")
    host: str = os.getenv("COLLECTOR_HOST", "127.0.0.1")
    port: int = int(os.getenv("COLLECTOR_PORT", "8001"))
    tenant_id: str = os.getenv("COLLECTOR_TENANT_ID", "demo-tenant")
    collector_id: str = os.getenv("COLLECTOR_ID", "collector-001")
    saas_url: str = os.getenv("SAAS_INGEST_URL", "")
    saas_api_key: str = os.getenv("SAAS_API_KEY", "")
    stale_after_seconds: int = int(os.getenv("STALE_AFTER_SECONDS", "300"))
    simulator_enabled: bool = os.getenv("SIMULATOR_ENABLED", "true").lower() == "true"
    retry_base_seconds: float = float(os.getenv("RETRY_BASE_SECONDS", "2"))
    retry_max_seconds: float = float(os.getenv("RETRY_MAX_SECONDS", "300"))
    retry_interval_seconds: float = float(os.getenv("RETRY_INTERVAL_SECONDS", "2"))
    host_sampling_interval_seconds: float = max(1.0, float(os.getenv("HOST_SAMPLING_INTERVAL_SECONDS", "3")))
    pseudonym_salt: str = os.getenv("PSEUDONYM_SALT", "local-only-change-me")
    health_good_threshold: float = float(os.getenv("HEALTH_GOOD_THRESHOLD", "60"))
    health_fair_threshold: float = float(os.getenv("HEALTH_FAIR_THRESHOLD", "75"))
    health_poor_threshold: float = float(os.getenv("HEALTH_POOR_THRESHOLD", "90"))


settings = Settings()
