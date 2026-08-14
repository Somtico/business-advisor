import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setTenantSlug } from '../lib/api';

interface AuthState {
  accessToken: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
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
      localStorage.setItem('ba_access_token', data.accessToken);
      if (data.organization?.slug) setTenantSlug(data.organization.slug);
      localStorage.setItem('ba_session', JSON.stringify(next));
      setState(next);
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem('ba_access_token');
    localStorage.removeItem('ba_session');
    setState({ accessToken: null, user: null, organization: null });
  }, []);

  const value = useMemo(
    () => ({ ...state, setSession, logout }),
    [state, setSession, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
