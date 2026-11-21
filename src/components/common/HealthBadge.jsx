// CICADA 2026 — Secure AIOps Observability Platform
// Reusable Health Badge Component
// Supports the 4 standardized health states: Excellent, Good, Fair, Poor

export default function HealthBadge({ status = "Good", showLabel = true, size = "md" }) {
  const normalized = (status || "").toLowerCase();

  const configs = {
    excellent: { label: "Excellent", meaning: "Healthy", colorClass: "health-excellent" },
    good: { label: "Good", meaning: "Normal", colorClass: "health-good" },
    fair: { label: "Fair", meaning: "Needs attention", colorClass: "health-fair" },
    poor: { label: "Poor", meaning: "Critical", colorClass: "health-poor" },
  };

  const current = configs[normalized] || configs.good;

  return (
    <span
      className={`health-pill ${current.colorClass} size-${size}`}
      title={`${current.label} — ${current.meaning}`}
    >
      <i className="status-dot" aria-hidden="true" />
      {showLabel && (
        <>
          <strong>{current.label}</strong>
          <span className="health-meaning">({current.meaning})</span>
        </>
      )}
    </span>
  );
}
