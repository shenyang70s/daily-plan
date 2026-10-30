import { text } from '../locales/zh-CN';

let csrfToken = '';
const sessionListeners = new Set<() => void>();
export function setCsrfToken(token: string): void { csrfToken = token; }
export function onSessionExpired(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
    readonly details: Record<string, unknown> = {},
  ) { super(message); }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const method = (options.method || 'GET').toUpperCase();
  if (options.body) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401 && path !== '/auth/login' && path !== '/me') {
    setCsrfToken('');
    for (const listener of sessionListeners) listener();
  }
  if (response.status === 204 && response.ok) return undefined as T;
  let data: unknown;
  try { data = await response.json(); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    if (response.ok) throw new ApiError(response.status, 'INVALID_RESPONSE', text.invalidResponse);
  }
  if (!response.ok) {
    const error = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const fieldErrors: Record<string, string[]> = {};
    if (error.fieldErrors && typeof error.fieldErrors === 'object') {
      for (const [key, value] of Object.entries(error.fieldErrors)) {
        if (Array.isArray(value) && value.every(item => typeof item === 'string')) fieldErrors[key] = value;
      }
    }
    const fallback = response.status === 409 ? text.versionConflict : text.requestFailed;
    throw new ApiError(response.status, typeof error.code === 'string' ? error.code : 'HTTP_ERROR', typeof error.message === 'string' ? error.message : fallback, fieldErrors, error.details && typeof error.details === 'object' ? error.details as Record<string, unknown> : {});
  }
  return data as T;
}
