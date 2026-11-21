import { fetchSaas } from './apiConfig.ts';
import { isDemoMode } from './dataMode.js';
import { mockSettingsData } from '../data/mockData.js';

const STORAGE_KEY = 'atria_preferences_v1';
const preferences = {
  notifications: { emailAlerts: false, criticalOnly: false, dailyDigest: false, incidentAutoAssign: false },
  display: { compactMode: false, autoRefresh: true, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, telemetryUnits: 'Metric' },
};

export async function getSettings() {
  if (isDemoMode()) return { success: true, data: mockSettingsData, source: 'demo' };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { /* Use local defaults. */ }
  const overview = await fetchSaas('/dashboard/overview');
  return {
    success: true,
    source: 'live',
    data: {
      profile: { fullName: 'Frontend demo session', role: 'Demo-only UI identity; not backend authentication', avatar: 'UI', tenantName: overview.tenant_name, memberSince: 'Not exposed by backend' },
      tenant: { workspaceName: overview.tenant_name, tenantId: overview.tenant_id, region: 'Not exposed by backend', retentionDays: 'Not exposed by backend' },
      notifications: { ...preferences.notifications, ...saved.notifications },
      display: { ...preferences.display, ...saved.display },
      systemInfo: { frontendVersion: 'Integrated frontend', environment: 'Live API mode', apiContractStatus: 'Connected endpoints shown per page' },
    },
  };
}

export async function saveSettings(newSettings) {
  const local = { notifications: newSettings.notifications, display: newSettings.display };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(local)); } catch { /* Preferences remain usable for this view. */ }
  return { success: true, data: newSettings, message: 'Browser preferences saved locally.' };
}
