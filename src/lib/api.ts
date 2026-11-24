const TOKEN_STORAGE_KEY = 'cc_auth_token';
const ACTIVE_JOB_STORAGE_KEY = 'cc_active_job_id';
const RETURN_JOB_STORAGE_KEY = 'cc_return_job_id';

let csrfTokenCache: string | null = null;
let authTokenMemory: string | null = readSessionStorage(TOKEN_STORAGE_KEY);
let activeViewingJobIdMemory: number | null = parsePositiveInt(
  readSessionStorage(ACTIVE_JOB_STORAGE_KEY)
);
let pendingReturnJobIdMemory: number | null = parsePositiveInt(
  readSessionStorage(RETURN_JOB_STORAGE_KEY)
);

let refreshInFlight: Promise<boolean> | null = null;
let authExpiredHandler: ((jobIdToReturn: number | null) => void) | null = null;

function readSessionStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch {
    // ignore storage restriction
  }
  return null;
}

function writeSessionStorage(key: string, value: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (value === null) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, value);
    }
  } catch {
    // ignore storage restriction
  }
}

function parsePositiveInt(val: string | null): number | null {
  if (!val) return null;
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function getAuthToken(): string | null {
  if (authTokenMemory) return authTokenMemory;
  const stored = readSessionStorage(TOKEN_STORAGE_KEY);
  if (stored) authTokenMemory = stored;
  return authTokenMemory;
}

export function setAuthToken(token: string | null): void {
  authTokenMemory = token && token.trim() ? token.trim() : null;
  writeSessionStorage(TOKEN_STORAGE_KEY, authTokenMemory);
}

export function clearAuthToken(): void {
  authTokenMemory = null;
  writeSessionStorage(TOKEN_STORAGE_KEY, null);
}

export function setActiveViewingJobId(jobId: number | null): void {
  activeViewingJobIdMemory = jobId && jobId > 0 ? jobId : null;
  writeSessionStorage(
    ACTIVE_JOB_STORAGE_KEY,
    activeViewingJobIdMemory ? String(activeViewingJobIdMemory) : null
  );
}

export function getActiveViewingJobId(): number | null {
  if (activeViewingJobIdMemory) return activeViewingJobIdMemory;
  return parsePositiveInt(readSessionStorage(ACTIVE_JOB_STORAGE_KEY));
}

export function setPendingReturnJobId(jobId: number | null): void {
  pendingReturnJobIdMemory = jobId && jobId > 0 ? jobId : null;
  writeSessionStorage(
    RETURN_JOB_STORAGE_KEY,
    pendingReturnJobIdMemory ? String(pendingReturnJobIdMemory) : null
  );
}

export function consumePendingReturnJobId(): number | null {
  const id =
    pendingReturnJobIdMemory ?? parsePositiveInt(readSessionStorage(RETURN_JOB_STORAGE_KEY));
  pendingReturnJobIdMemory = null;
  writeSessionStorage(RETURN_JOB_STORAGE_KEY, null);
  return id;
}

export function registerAuthExpiredHandler(
  handler: ((jobIdToReturn: number | null) => void) | null
): void {
  authExpiredHandler = handler;
}

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public data?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function fetchCsrfToken(forceRefresh = false): Promise<string> {
  if (csrfTokenCache && !forceRefresh) return csrfTokenCache;
  try {
    const res = await fetch('/api/auth/csrf', {
      method: 'GET',
      credentials: 'include',
    });
    const data = await res.json();
    if (res.ok && data?.csrfToken) {
      csrfTokenCache = data.csrfToken;
      return data.csrfToken;
    }
    throw new ApiError(data?.error || 'Failed to initialize security token', res.status);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Network error. Please check your connection and try again.', 0);
  }
}

function isAuthEndpointWithoutSilentRefresh(url: string): boolean {
  return (
    url.startsWith('/api/auth/login') ||
    url.startsWith('/api/auth/register-') ||
    url.startsWith('/api/auth/send-code') ||
    url.startsWith('/api/auth/refresh') ||
    url.startsWith('/api/auth/logout') ||
    url.startsWith('/api/auth/me') ||
    url.startsWith('/api/auth/csrf')
  );
}

async function trySilentRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const csrf = await fetchCsrfToken(true);
      const currentToken = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
      };
      if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
      }
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (typeof data.token === 'string' && data.token) {
        setAuthToken(data.token);
      }
      return Boolean(data.user);
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiRequest<T = unknown>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    isFormData?: boolean;
    skipAuthRetry?: boolean;
  } = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();

  const executeFetch = async (forceCsrfRefresh = false): Promise<Response> => {
    const headers: Record<string, string> = {};
    const bearer = getAuthToken();
    if (bearer) {
      headers['Authorization'] = `Bearer ${bearer}`;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      const csrfToken = await fetchCsrfToken(forceCsrfRefresh);
      headers['X-CSRF-Token'] = csrfToken;
    }

    let bodyPayload: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.isFormData && options.body instanceof FormData) {
        bodyPayload = options.body;
      } else {
        headers['Content-Type'] = 'application/json';
        bodyPayload = JSON.stringify(options.body);
      }
    }

    try {
      return await fetch(url, {
        method,
        headers,
        body: bodyPayload,
        credentials: 'include',
      });
    } catch {
      throw new ApiError('Network error. Please check your connection and try again.', 0);
    }
  };

  let res = await executeFetch(false);

  // If CSRF token expired/invalidated, refresh once and retry
  if (res.status === 403 && method !== 'GET') {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = await res.clone().json();
    } catch {
      // ignore
    }
    if (typeof parsed.error === 'string' && parsed.error.toLowerCase().includes('csrf')) {
      res = await executeFetch(true);
    }
  }

  // If 401 on a protected endpoint, attempt one silent session refresh before redirecting to Login
  if (res.status === 401 && !options.skipAuthRetry && !isAuthEndpointWithoutSilentRefresh(url)) {
    const refreshed = await trySilentRefresh();
    if (refreshed) {
      res = await executeFetch(false);
    }
    if (res.status === 401) {
      clearAuthToken();
      const jobToReturn = getActiveViewingJobId();
      if (jobToReturn) {
        setPendingReturnJobId(jobToReturn);
      }
      authExpiredHandler?.(jobToReturn);
    }
  }

  let json: Record<string, unknown> = {};
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = {error: text};
    }
  }

  if (res.ok) {
    if (typeof json.token === 'string' && json.token) {
      setAuthToken(json.token);
    } else if (url.startsWith('/api/auth/logout') || (url.startsWith('/api/auth/me') && !json.user)) {
      clearAuthToken();
    }
  }

  if (!res.ok) {
    const msg = typeof json.error === 'string' ? json.error : `Request failed (${res.status})`;
    const code = typeof json.code === 'string' ? json.code : undefined;
    throw new ApiError(msg, res.status, code, json);
  }

  return json as T;
}
