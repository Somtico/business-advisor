const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function getTenantSlug(): string | null {
  return localStorage.getItem('ba_tenant_slug');
}

export function setTenantSlug(slug: string) {
  localStorage.setItem('ba_tenant_slug', slug);
}

export function clearTenantSlug() {
  localStorage.removeItem('ba_tenant_slug');
}

export class ApiError extends Error {
  code?: string;
  requiresVerification?: boolean;
  email?: string;
  status: number;

  constructor(
    message: string,
    opts: {
      status: number;
      code?: string;
      requiresVerification?: boolean;
      email?: string;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.requiresVerification = opts.requiresVerification;
    this.email = opts.email;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = localStorage.getItem('ba_access_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const slug = getTenantSlug();
  if (slug) headers.set('X-Tenant-Slug', slug);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(json?.error?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: json?.error?.code,
      requiresVerification: json?.error?.requiresVerification,
      email: json?.error?.email,
    });
  }
  return json as T;
}

export function money(cents: number | null | undefined, currency = 'CAD'): string {
  const n = (cents ?? 0) / 100;
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
  }).format(n);
}
