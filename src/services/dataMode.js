const STORAGE_KEY = 'atria_data_mode';
const defaultMode = import.meta.env.VITE_DATA_MODE === 'demo' ? 'demo' : 'live';

export function getDataMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'demo' || saved === 'live') return saved;
  } catch {
    // Keep the configured default in browsers where local storage is disabled.
  }
  return defaultMode;
}

export function setDataMode(mode) {
  if (mode !== 'live' && mode !== 'demo') throw new Error('Unknown data mode');
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // The caller will still switch this page view; persistence is optional.
  }
  window.dispatchEvent(new CustomEvent('atria:data-mode', { detail: mode }));
  return mode;
}

export function isDemoMode() {
  return getDataMode() === 'demo';
}
