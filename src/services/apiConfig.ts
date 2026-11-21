import { isDemoMode } from './dataMode';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');
const readTenantId = () => {
  const configured = import.meta.env.VITE_TENANT_ID?.trim();
  if (configured) return configured;
  try {
    return localStorage.getItem('atria_tenant_id')?.trim() || '';
  } catch {
    return '';
  }
};

export const API_CONFIG = {
  saasBaseUrl: trimTrailingSlash(import.meta.env.VITE_SAAS_API_BASE_URL || '/api/v1'),
  localCollectorBaseUrl: trimTrailingSlash(import.meta.env.VITE_LOCAL_COLLECTOR_URL || '/collector'),
  timeoutMs: 8000,
};

export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(`Request timed out after ${API_CONFIG.timeoutMs}ms`, 408);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const message = body?.message || body?.detail || `${response.status} ${response.statusText}`;
    throw new ApiError(typeof message === 'string' ? message : JSON.stringify(message), response.status, body);
  }
  return body as T;
}

export async function fetchSaas<T>(path: string, options: RequestInit = {}): Promise<T> {
  const tenantId = readTenantId();
  if (!tenantId) {
    throw new ApiError('Configure VITE_TENANT_ID for the provisioned SaaS tenant, then restart Vite.', 400);
  }
  return requestJson<T>(`${API_CONFIG.saasBaseUrl}${path}`, {
    ...options,
    headers: { 'X-Tenant-ID': tenantId, ...(options.headers || {}) },
  });
}

export async function fetchCollector<T>(path: string, options: RequestInit = {}): Promise<T> {
  return requestJson<T>(`${API_CONFIG.localCollectorBaseUrl}${path}`, options);
}

export function liveSource() {
  return { source: 'live' as const, isLive: true, isDemo: false, observedAt: new Date().toISOString() };
}

export function demoSource() {
  return { source: 'demo' as const, isLive: false, isDemo: true, observedAt: new Date().toISOString() };
}

export function currentDataMode() {
  return isDemoMode() ? 'demo' : 'live';
}
