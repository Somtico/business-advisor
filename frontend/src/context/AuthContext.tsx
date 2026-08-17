import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setTenantSlug } from '../lib/api';

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

interface AuthState {
  accessToken: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
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
}

interface AuthContextValue extends AuthState {
  setSession: (data: {
    accessToken: string;
    user: AuthState['user'];
    organization: AuthState['organization'];
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
      return { accessToken: null, user: null, organization: null };
    }
    return JSON.parse(raw) as AuthState;
  } catch {
    return { accessToken: null, user: null, organization: null };
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
    }) => {
      const next = {
        accessToken: data.accessToken,
        user: data.user,
        organization: data.organization,
      };
      if (data.organization?.slug) setTenantSlug(data.organization.slug);
      persist(next);
      setState(next);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem('ba_access_token');
    localStorage.removeItem('ba_session');
    setState({ accessToken: null, user: null, organization: null });
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
      const next = {
        accessToken: token,
        user: res.data.user,
        organization: org,
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
