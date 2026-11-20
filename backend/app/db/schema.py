import sqlite3

DDL_SCRIPT = """
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collectors (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_heartbeat TEXT
);

CREATE TABLE IF NOT EXISTS telemetry_batches (
    batch_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    collector_id TEXT NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    schema_version TEXT NOT NULL DEFAULT '1.0',
    metadata_json TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telemetry_records (
    metric_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES telemetry_batches(batch_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    collector_id TEXT NOT NULL REFERENCES collectors(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anomalies (
    anomaly_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_id TEXT,
    source TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    observed_value REAL NOT NULL,
    baseline_value REAL,
    severity TEXT NOT NULL,
    explanation TEXT NOT NULL,
    detected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
    incident_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    affected_source TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    first_detected_at TEXT NOT NULL,
    last_updated_at TEXT NOT NULL,
    related_metrics_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
    recommendation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id TEXT REFERENCES incidents(incident_id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    suggested_action TEXT NOT NULL,
    severity TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_evaluations (
    evaluation_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    health_status TEXT NOT NULL,
    health_score REAL NOT NULL,
    contributing_metrics_json TEXT NOT NULL,
    explanation TEXT NOT NULL,
    evaluated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_time ON telemetry_records(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_metric ON telemetry_records(tenant_id, metric_name);
CREATE INDEX IF NOT EXISTS idx_telemetry_batch ON telemetry_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_collectors_api_key ON collectors(api_key);
CREATE INDEX IF NOT EXISTS idx_collectors_tenant ON collectors(tenant_id);

CREATE INDEX IF NOT EXISTS idx_anomalies_tenant_time ON anomalies(tenant_id, detected_at);
CREATE INDEX IF NOT EXISTS idx_anomalies_tenant_source ON anomalies(tenant_id, source, metric_name);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status ON incidents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_source ON incidents(tenant_id, affected_source);
CREATE INDEX IF NOT EXISTS idx_recommendations_tenant ON recommendations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_incident ON recommendations(incident_id);
CREATE INDEX IF NOT EXISTS idx_health_tenant_source ON health_evaluations(tenant_id, source);
"""


def init_db(conn: sqlite3.Connection) -> None:
    """Initializes the database tables and indexes safely without dropping data."""
    conn.executescript(DDL_SCRIPT)
    conn.commit()
