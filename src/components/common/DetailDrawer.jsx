// CICADA 2026 — Secure AIOps Observability Platform
// DetailDrawer Component — Slide-over inspector panel

import { useEffect } from "react";
import { X } from "lucide-react";

export default function DetailDrawer({ isOpen, onClose, title, subtitle, children, actions }) {
  // Close drawer on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="drawer-portal">
      <div className="drawer-backdrop" onClick={onClose} aria-label="Close panel" />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-header">
          <div className="drawer-header-text">
            <h3 id="drawer-title">{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-body">
          {children}
        </div>

        {actions && (
          <footer className="drawer-footer">
            {actions}
          </footer>
        )}
      </aside>
    </div>
  );
}
