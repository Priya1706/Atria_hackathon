/**
 * API Client Configuration for CICADA 2026 Observability Platform
 * Separates Local Enclave API (port 8080 local-only) from Central SaaS API.
 */

export const API_CONFIG = {
  // Central SaaS API base URL
  saasBaseUrl: import.meta.env.VITE_SAAS_API_BASE_URL || '/api',

  // Local Collector API endpoint (Accessible ONLY inside customer perimeter)
  localCollectorBaseUrl: import.meta.env.VITE_LOCAL_COLLECTOR_URL || 'http://127.0.0.1:8080/api/local',

  // Request timeout in milliseconds
  timeoutMs: 8000,

  // Feature flag: whether to fall back gracefully to offline telemetry fixtures if backend is unreachable
  allowMockFallback: true,
};

export class ApiError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiError(`Request timeout after ${API_CONFIG.timeoutMs}ms`, 408);
    }
    throw error;
  }
}
