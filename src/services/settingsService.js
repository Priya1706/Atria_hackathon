// CICADA 2026 — Secure AIOps Observability Platform
// Settings Service Interface
// Expected API endpoints:
// GET /api/v1/settings
// PUT /api/v1/settings

import { mockSettingsData } from "../data/mockData";

const STORAGE_KEY = "cicada_settings_v1";

export async function getSettings() {
  return new Promise((resolve) => {
    setTimeout(() => {
      let saved = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) saved = JSON.parse(raw);
      } catch {
        // localStorage unavailable in sandboxed environment
      }

      resolve({
        success: true,
        data: saved || mockSettingsData,
      });
    }, 100);
  });
}

export async function saveSettings(newSettings) {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      } catch {
        // ignore storage errors
      }

      resolve({
        success: true,
        data: newSettings,
        message: "Settings preferences saved successfully (Demo State)",
      });
    }, 120);
  });
}
