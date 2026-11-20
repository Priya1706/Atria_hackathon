// CICADA 2026 — Secure AIOps Observability Platform
// Reusable StatCard Component

import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function StatCard({ item, onClick }) {
  const Icon = item.icon;
  const isClickable = Boolean(onClick);

  return (
    <article
      className={`stat-card ${isClickable ? "clickable" : ""}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="stat-card-top">
        <span>{item.label}</span>
        {Icon && (
          <div className="stat-icon">
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className="stat-value">{item.value}</div>
      <div className="stat-card-bottom">
        {item.change && (
          <div className={`stat-change ${item.trend || "neutral"}`}>
            {item.trend === "up" ? (
              <ArrowUpRight size={14} />
            ) : item.trend === "down" ? (
              <ArrowDownRight size={14} />
            ) : null}
            <span>{item.change}</span>
          </div>
        )}
        {item.detail && <span className="stat-detail-text">{item.detail}</span>}
      </div>
    </article>
  );
}
