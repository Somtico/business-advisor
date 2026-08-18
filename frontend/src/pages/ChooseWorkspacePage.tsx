import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useAuth, type WorkspaceSummary } from '../context/AuthContext';
import { PublicShell } from '../components/PublicShell';
import { ROLE_LABELS } from '../lib/workspace';

export function ChooseWorkspacePage() {
  const { accessToken, workspaces, noWorkspace, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!accessToken) return <Navigate to="/login" replace />;

  async function openWorkspace(workspace: WorkspaceSummary) {
    setBusyId(workspace.id);
    setError(null);
    try {
      const res = await api<{
        success: boolean;
        data: {
          accessToken: string;
          user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role?: string;
            organizationId?: string;
          };
          organization: {
            id: string;
            name: string;
            slug: string;
            status: string;
            onboardingCompleted?: boolean;
          };
          workspaces?: WorkspaceSummary[];
        };
      }>('/api/auth/select-workspace', {
        method: 'POST',
        body: JSON.stringify({ organizationId: workspace.id }),
      });
      setSession({
        accessToken: res.data.accessToken,
        user: res.data.user,
        organization: res.data.organization,
        workspaces: res.data.workspaces || workspaces,
        needsWorkspaceSelection: false,
        noWorkspace: false,
      });
      navigate(
        res.data.organization.onboardingCompleted ? '/app' : '/app/onboarding'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that workspace');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PublicShell compact>
      <div className="flex items-center justify-center bg-[radial-gradient(circle_at_top,_#dce9ef,_#f7fafc_55%)] px-4 py-12">
        <div className="w-full max-w-md border border-ba-line bg-white p-8">
          <h1 className="font-display text-3xl font-bold">Choose A Workspace</h1>
          {noWorkspace || workspaces.length === 0 ? (
            <p className="mt-4 text-base text-ba-ink/80">
              This account is not linked to an organization yet. Create one to
              continue, or accept an invitation sent to your email.
            </p>
          ) : (
            <p className="mt-4 text-base text-ba-ink/80">
              Select the organization you want to open.
            </p>
          )}
          <ul className="mt-6 space-y-3">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void openWorkspace(ws)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md border border-ba-line px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    <span className="block font-semibold">{ws.name}</span>
                    <span className="block text-base text-ba-ink/70">
                      {ROLE_LABELS[ws.role] || ws.role}
                    </span>
                  </span>
                  <span className="text-base font-semibold text-ba-accent">
                    {busyId === ws.id ? 'Opening…' : 'Open'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
          <p className="mt-6 text-base">
            <Link className="text-ba-accent underline" to="/signup">
              Create Organization
            </Link>
            {' · '}
            <button
              type="button"
              onClick={logout}
              className="cursor-pointer text-ba-warm underline"
            >
              Sign Out
            </button>
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
