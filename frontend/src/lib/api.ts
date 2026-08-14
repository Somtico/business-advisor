const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function getTenantSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('slug')) return params.get('slug');
  return localStorage.getItem('ba_tenant_slug');
}

export function setTenantSlug(slug: string) {
  localStorage.setItem('ba_tenant_slug', slug);
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
    throw new Error(json?.error?.message || `Request failed (${res.status})`);
  }
  return json as T;
}

export function money(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(n);
}
