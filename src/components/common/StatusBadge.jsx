// CICADA 2026 — Secure AIOps Observability Platform
// Reusable Status Badge Component
// Handles status tokens: Online/Offline, Severity, Alert Status, Transmission Status

export default function StatusBadge({ status = "", variant, size = "md" }) {
  const norm = (status || "").toLowerCase().replace(/\s+/g, "-");

  // Determine variant style class
  let badgeClass = `status-badge ${norm} size-${size}`;
  if (variant) {
    badgeClass += ` badge-${variant}`;
  }

  return (
    <span className={badgeClass}>
      <i className="badge-indicator-dot" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
