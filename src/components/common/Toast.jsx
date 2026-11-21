// CICADA 2026 — Secure AIOps Observability Platform
// Interactive Demo Toast Feedback

import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
  };

  const Icon = icons[toast.type] || Info;

  return (
    <div className={`toast-notification toast-${toast.type || "info"}`} role="status">
      <Icon size={18} className="toast-icon" />
      <div className="toast-content">
        <strong>{toast.title || "Notification"}</strong>
        <span>{toast.message}</span>
      </div>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss notification">
        <X size={15} />
      </button>
    </div>
  );
}
