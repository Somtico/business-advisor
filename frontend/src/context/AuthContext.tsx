import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, clearTenantSlug, revokeSessionOnServer, setTenantSlug } from '../lib/api';
import {
  AUTH_CHANNEL,
  SESSION_ENDED_EVENT,
  clearLastActivity,
  writeLastActivity,
  type SessionEndReason,
  type SessionPolicy,
} from '../lib/session';

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
    currency?: string;
    onboardingCompleted?: boolean;
  } | null;
  workspaces: WorkspaceSummary[];
  needsWorkspaceSelection: boolean;
  noWorkspace: boolean;
  session: SessionPolicy | null;
}

type WorkspaceSessionPayload = {
  accessToken: string;
  user: AuthState['user'];
  organization: NonNullable<AuthState['organization']>;
  workspaces?: WorkspaceSummary[];
  session?: SessionPolicy;
};

interface AuthContextValue extends AuthState {
  setSession: (data: {
    accessToken: string;
    user: AuthState['user'];
    organization: AuthState['organization'];
    workspaces?: WorkspaceSummary[];
    needsWorkspaceSelection?: boolean;
    noWorkspace?: boolean;
    session?: SessionPolicy | null;
  }) => void;
  selectWorkspace: (
    organizationId: string
  ) => Promise<NonNullable<AuthState['organization']>>;
  refreshSession: () => Promise<void>;
  applyLegalAcceptance: (legal: LegalAcceptanceStatus) => void;
  applySession: (session: SessionPolicy) => void;
  logout: (reason?: SessionEndReason) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function emptyState(): AuthState {
  return {
    accessToken: null,
    user: null,
    organization: null,
    workspaces: [],
    needsWorkspaceSelection: false,
    noWorkspace: false,
    session: null,
  };
}

function loadInitial(): AuthState {
  try {
    const raw = localStorage.getItem('ba_session');
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    return {
      accessToken: parsed.accessToken ?? null,
      user: parsed.user ?? null,
      organization: parsed.organization ?? null,
      workspaces: parsed.workspaces ?? [],
      needsWorkspaceSelection: Boolean(parsed.needsWorkspaceSelection),
      noWorkspace: Boolean(parsed.noWorkspace),
      session: parsed.session ?? null,
    };
  } catch {
    return emptyState();
  }
}

function persist(next: AuthState) {
  if (next.accessToken) {
    localStorage.setItem('ba_access_token', next.accessToken);
    localStorage.setItem('ba_session', JSON.stringify(next));
  }
}

function clearPersistedSession() {
  localStorage.removeItem('ba_access_token');
  localStorage.removeItem('ba_session');
  clearTenantSlug();
  clearLastActivity();
}

function redirectForReason(reason: SessionEndReason) {
  if (reason === 'idle') {
    window.location.assign('/login?reason=timeout');
    return;
  }
  if (reason === 'expired') {
    window.location.assign('/login?reason=expired');
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);
  const loggingOutRef = useRef(false);

  const setSession = useCallback(
    (data: {
      accessToken: string;
      user: AuthState['user'];
      organization: AuthState['organization'];
      workspaces?: WorkspaceSummary[];
      needsWorkspaceSelection?: boolean;
      noWorkspace?: boolean;
      session?: SessionPolicy | null;
    }) => {
      setState((prev: AuthState) => {
        const next: AuthState = {
          accessToken: data.accessToken,
          user: data.user,
          organization: data.organization,
          workspaces: data.workspaces ?? prev.workspaces,
          needsWorkspaceSelection: Boolean(data.needsWorkspaceSelection),
          noWorkspace: Boolean(data.noWorkspace),
          session: data.session !== undefined ? data.session : prev.session,
        };
        if (data.organization?.slug) setTenantSlug(data.organization.slug);
        else clearTenantSlug();
        persist(next);
        writeLastActivity();
        return next;
      });
    },
    []
  );

  const applySession = useCallback((session: SessionPolicy) => {
    setState((prev: AuthState) => {
      if (!prev.accessToken) return prev;
      const next = { ...prev, session };
      persist(next);
      return next;
    });
  }, []);

  const selectWorkspace = useCallback(
    async (organizationId: string) => {
      const res = await api<{
        success: boolean;
        data: WorkspaceSessionPayload;
      }>('/api/auth/select-workspace', {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      });
      setSession({
        accessToken: res.data.accessToken,
        user: res.data.user,
        organization: res.data.organization,
        workspaces: res.data.workspaces,
        needsWorkspaceSelection: false,
        noWorkspace: false,
        session: res.data.session,
      });
      return res.data.organization;
    },
    [setSession]
  );

  const logout = useCallback((reason: SessionEndReason = 'logout') => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    revokeSessionOnServer();
    try {
      const channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.postMessage({ type: 'logout', reason });
      channel.close();
    } catch {
      /* BroadcastChannel may be unavailable. */
    }
    clearPersistedSession();
    setState(emptyState());
    redirectForReason(reason);
    window.setTimeout(() => {
      loggingOutRef.current = false;
    }, 500);
  }, []);

  const applyLegalAcceptance = useCallback((legal: LegalAcceptanceStatus) => {
    setState((prev: AuthState) => {
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
          session?: SessionPolicy;
        };
      }>('/api/auth/me');
      const org = res.data.organization
        ? {
            id: res.data.organization.id,
            name: res.data.organization.name,
            slug: res.data.organization.slug,
            status: res.data.organization.status,
            educationSubtype: res.data.organization.educationSubtype,
            currency: res.data.organization.currency,
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
        session: res.data.session ?? null,
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

  useEffect(() => {
    const onSessionEnded = (event: Event) => {
      const reason = (event as CustomEvent<{ reason?: SessionEndReason }>).detail
        ?.reason;
      logout(reason === 'idle' ? 'idle' : 'expired');
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'logout') {
          if (loggingOutRef.current) return;
          loggingOutRef.current = true;
          clearPersistedSession();
          setState(emptyState());
          redirectForReason(
            event.data.reason === 'idle'
              ? 'idle'
              : event.data.reason === 'expired'
                ? 'expired'
                : 'logout'
          );
          window.setTimeout(() => {
            loggingOutRef.current = false;
          }, 500);
        }
      };
    } catch {
      channel = null;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'ba_access_token' && !event.newValue) {
        if (loggingOutRef.current) return;
        loggingOutRef.current = true;
        clearPersistedSession();
        setState(emptyState());
        window.setTimeout(() => {
          loggingOutRef.current = false;
        }, 500);
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
      window.removeEventListener('storage', onStorage);
      channel?.close();
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      ...state,
      setSession,
      selectWorkspace,
      refreshSession,
      applyLegalAcceptance,
      applySession,
      logout,
    }),
    [
      state,
      setSession,
      selectWorkspace,
      refreshSession,
      applyLegalAcceptance,
      applySession,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
