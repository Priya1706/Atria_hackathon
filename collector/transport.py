"""SaaS delivery with stable batch keys, atomic queue claims, and persistent backoff."""
import logging
import math
from urllib.parse import urlparse
import httpx
from .settings import settings
from .store import Store

log = logging.getLogger("collector.transport")


def _safe_destination(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and bool(parsed.netloc)


def transmit_pending(store: Store, client=None):
    # No destination or API key: stay safely buffered until the contract is configured.
    if not settings.saas_url or not settings.saas_api_key or not _safe_destination(settings.saas_url):
        return 0
    delivered = 0
    owns_client = client is None
    client = client or httpx.Client(timeout=8.0, verify=True)
    try:
        for queued in store.pending(due_only=True):
            row = store.claim(queued["payload_id"])
            if row is None:
                continue
            headers = {
                "X-API-Key": settings.saas_api_key,
                "Idempotency-Key": row["payload_id"],
                "Content-Type": "application/json",
            }
            try:
                # Send the same serialized string whose hash and bytes are audited.
                response = client.post(settings.saas_url, content=row["payload_json"], headers=headers)
                response.raise_for_status()
                store.update_egress(row["payload_id"], "sent")
                delivered += 1
            except Exception as exc:
                delay = min(settings.retry_max_seconds, settings.retry_base_seconds * (2 ** min(row["retry_attempts"] - 1, 20)))
                store.update_egress(row["payload_id"], "failed", type(exc).__name__, delay)
                # Never log exception text, URL query strings, or credentials.
                log.warning("Delivery failed for batch %s (%s); retry in %ss", row["payload_id"], type(exc).__name__, math.ceil(delay))
    finally:
        if owns_client:
            client.close()
    return delivered
