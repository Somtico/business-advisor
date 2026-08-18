import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearTenantSlug, setTenantSlug } from '../lib/api';

export interface LegalAcceptanceStatus {
  termsVersion: string;
  privacyVersion: string;
  acceptedTermsVersion: string | null;
  acceptedPrivacyVersion: string | null;
  noticePublishedAt: string;
  materialChangeEffectiveAt: string;
  materialChangeInForce: boolean;
  current: boolean;
  pendingNotice: boolean;
  requiresReacceptance: boolean;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  status: string;
  onboardingCompleted: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
    organizationId?: string;
    termsVersion?: string | null;
    privacyVersion?: string | null;
    legal?: LegalAcceptanceStatus | null;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    educationSubtype?: string;
    onboardingCompleted?: boolean;
  } | null;
  workspaces: WorkspaceSummary[];
  needsWorkspaceSelection: boolean;
  noWorkspace: boolean;
}

interface AuthContextValue extends AuthState {
  setSession: (data: {
    accessToken: string;
    user: AuthState['user'];
    organization: AuthState['organization'];
    workspaces?: WorkspaceSummary[];
    needsWorkspaceSelection?: boolean;
    noWorkspace?: boolean;
  }) => void;
  refreshSession: () => Promise<void>;
  applyLegalAcceptance: (legal: LegalAcceptanceStatus) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadInitial(): AuthState {
  try {
    const raw = localStorage.getItem('ba_session');
    if (!raw) {
      return {
        accessToken: null,
        user: null,
        organization: null,
        workspaces: [],
        needsWorkspaceSelection: false,
        noWorkspace: false,
      };
    }
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    return {
      accessToken: parsed.accessToken ?? null,
      user: parsed.user ?? null,
      organization: parsed.organization ?? null,
      workspaces: parsed.workspaces ?? [],
      needsWorkspaceSelection: Boolean(parsed.needsWorkspaceSelection),
      noWorkspace: Boolean(parsed.noWorkspace),
    };
  } catch {
    return {
      accessToken: null,
      user: null,
      organization: null,
      workspaces: [],
      needsWorkspaceSelection: false,
      noWorkspace: false,
    };
  }
}

function persist(next: AuthState) {
  if (next.accessToken) {
    localStorage.setItem('ba_access_token', next.accessToken);
    localStorage.setItem('ba_session', JSON.stringify(next));
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);

  const setSession = useCallback(
    (data: {
      accessToken: string;
      user: AuthState['user'];
      organization: AuthState['organization'];
      workspaces?: WorkspaceSummary[];
      needsWorkspaceSelection?: boolean;
      noWorkspace?: boolean;
    }) => {
      const next: AuthState = {
        accessToken: data.accessToken,
        user: data.user,
        organization: data.organization,
        workspaces: data.workspaces ?? [],
        needsWorkspaceSelection: Boolean(data.needsWorkspaceSelection),
        noWorkspace: Boolean(data.noWorkspace),
      };
      if (data.organization?.slug) setTenantSlug(data.organization.slug);
      else clearTenantSlug();
      persist(next);
      setState(next);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem('ba_access_token');
    localStorage.removeItem('ba_session');
    clearTenantSlug();
    setState({
      accessToken: null,
      user: null,
      organization: null,
      workspaces: [],
      needsWorkspaceSelection: false,
      noWorkspace: false,
    });
  }, []);

  const applyLegalAcceptance = useCallback((legal: LegalAcceptanceStatus) => {
    setState((prev) => {
      if (!prev.user) return prev;
      const next = {
        ...prev,
        user: {
          ...prev.user,
          termsVersion: legal.termsVersion,
          privacyVersion: legal.privacyVersion,
          legal,
        },
      };
      persist(next);
      return next;
    });
  }, []);

  const refreshSession = useCallback(async () => {
    const token = localStorage.getItem('ba_access_token');
    if (!token) return;
    try {
      const res = await api<{
        success: boolean;
        data: {
          user: AuthState['user'];
          organization: AuthState['organization'] & {
            entitlement?: unknown;
            subscription?: unknown;
          };
          workspaces?: WorkspaceSummary[];
          needsWorkspaceSelection?: boolean;
          noWorkspace?: boolean;
        };
      }>('/api/auth/me');
      const org = res.data.organization
        ? {
            id: res.data.organization.id,
            name: res.data.organization.name,
            slug: res.data.organization.slug,
            status: res.data.organization.status,
            educationSubtype: res.data.organization.educationSubtype,
            onboardingCompleted: res.data.organization.onboardingCompleted,
          }
        : null;
      if (org?.slug) setTenantSlug(org.slug);
      else clearTenantSlug();
      const next: AuthState = {
        accessToken: token,
        user: res.data.user,
        organization: org,
        workspaces: res.data.workspaces || [],
        needsWorkspaceSelection: Boolean(res.data.needsWorkspaceSelection),
        noWorkspace: Boolean(res.data.noWorkspace),
      };
      persist(next);
      setState(next);
    } catch {
      // Keep cached session; next protected call will surface auth errors.
    }
  }, []);

  useEffect(() => {
    if (state.accessToken) {
      void refreshSession();
    }
    // Intentionally once on mount for an existing token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ ...state, setSession, refreshSession, applyLegalAcceptance, logout }),
    [state, setSession, refreshSession, applyLegalAcceptance, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
