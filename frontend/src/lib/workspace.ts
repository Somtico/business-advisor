const ROOT_DOMAIN = (
  import.meta.env.VITE_ROOT_DOMAIN || 'businessadvisor.app'
).toLowerCase();

/** Workspace slug from the browser host (acme.businessadvisor.app → acme). */
export function hostWorkspaceSlug(): string | null {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) return null;
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
    if (sub && !sub.includes('.')) return sub;
  }
  return null;
}

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  FINANCE: 'Finance',
  OPERATIONS: 'Operations',
  ANALYST: 'Analyst',
  VIEWER: 'Viewer',
};
