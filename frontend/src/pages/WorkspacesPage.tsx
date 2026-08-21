import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { api } from '../lib/api';
import { useAuth, type WorkspaceSummary } from '../context/AuthContext';
import { PublicShell } from '../components/PublicShell';
import {
  EDUCATION_SUBTYPE_OPTIONS,
  RequiredMark,
  slugifyOrganizationName,
  type EducationSubtypeValue,
} from '../lib/forms';
import { ROLE_LABELS } from '../lib/workspace';

const ROOT_DOMAIN =
  import.meta.env.VITE_ROOT_DOMAIN || 'businessadvisor.app';

export function WorkspacesPage() {
  const {
    accessToken,
    workspaces,
    organization,
    user,
    setSession,
    selectWorkspace,
    logout,
  } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<WorkspaceSummary[]>(workspaces);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [educationSubtype, setEducationSubtype] =
    useState<EducationSubtypeValue>(EDUCATION_SUBTYPE_OPTIONS[0].value);
  const [educationSubtypeOther, setEducationSubtypeOther] = useState('');

  useEffect(() => {
    setRows(workspaces);
  }, [workspaces]);

  useEffect(() => {
    if (!accessToken) return;
    api<{ success: boolean; data: { workspaces: WorkspaceSummary[] } }>(
      '/api/auth/workspaces'
    )
      .then((res) => setRows(res.data.workspaces))
      .catch(() => {
        /* Keep the session list if the refresh fails. */
      });
  }, [accessToken]);

  if (!accessToken) return <Navigate to="/login" replace />;

  async function openWorkspace(workspace: WorkspaceSummary) {
    setBusyId(workspace.id);
    setError(null);
    try {
      const org = await selectWorkspace(workspace.id);
      navigate(org.onboardingCompleted ? '/app' : '/app/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that workspace');
    } finally {
      setBusyId(null);
    }
  }

  function updateName(value: string) {
    setOrgName(value);
    if (!slugManual) setSlug(slugifyOrganizationName(value));
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (educationSubtype === 'OTHER' && !educationSubtypeOther.trim()) {
      setError('Please describe your education subtype when selecting Other.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await api<{
        success: boolean;
        data: {
          session: {
            accessToken: string;
            user: NonNullable<typeof user>;
            organization: NonNullable<typeof organization>;
            workspaces?: WorkspaceSummary[];
            session?: {
              idleTimeoutMs: number;
              warningMs: number;
              absoluteTimeoutMs: number;
              lastActivityAt: string;
              expiresAt: string;
            };
          };
        };
      }>('/api/auth/organizations', {
        method: 'POST',
        body: JSON.stringify({
          organizationName: orgName,
          slug,
          educationSubtype,
          educationSubtypeOther:
            educationSubtype === 'OTHER' ? educationSubtypeOther : undefined,
        }),
      });
      setSession({
        accessToken: res.data.session.accessToken,
        user: res.data.session.user,
        organization: res.data.session.organization,
        workspaces: res.data.session.workspaces,
        needsWorkspaceSelection: false,
        noWorkspace: false,
        session: res.data.session.session,
      });
      navigate('/app/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create organization');
    } finally {
      setCreating(false);
    }
  }

  return (
    <PublicShell compact>
      <div className="flex items-center justify-center bg-[radial-gradient(circle_at_top,_#dce9ef,_#f7fafc_55%)] px-4 py-12">
        <div className="w-full max-w-lg border border-ba-line bg-white p-8">
          <h1 className="font-display text-3xl font-bold">My Workspaces</h1>
          {rows.length === 0 ? (
            <p className="mt-4 text-base text-ba-ink/80">
              This account is not linked to an organization yet. Create one to
              continue, or accept an invitation sent to your email.
            </p>
          ) : (
            <p className="mt-4 text-base text-ba-ink/80">
              Open a workspace you belong to, or create a new organization.
            </p>
          )}
          <ul className="mt-6 divide-y divide-ba-line border-y border-ba-line">
            {rows.map((ws) => {
              const current = organization?.id === ws.id;
              return (
                <li key={ws.id}>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void openWorkspace(ws)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="font-semibold">
                      {ws.name}
                      {current ? (
                        <span className="ml-2 font-normal text-ba-ink/60">
                          (Current)
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-base font-semibold uppercase tracking-wide text-ba-ink/70">
                      {ROLE_LABELS[ws.role] || ws.role}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error && <p className="mt-3 text-base text-ba-warm">{error}</p>}
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-6 w-full cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white"
            >
              Create New Organization
            </button>
          ) : (
            <form onSubmit={(e) => void onCreate(e)} className="mt-6">
              <h2 className="font-display text-2xl font-bold">
                Create New Organization
              </h2>
              <label className="mt-4 block text-base font-semibold">
                Business / Organization Name
                <RequiredMark />
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border-ba-line text-base"
                  value={orgName}
                  onChange={(e) => updateName(e.target.value)}
                  required
                  autoComplete="organization"
                />
              </label>
              <label className="mt-4 block text-base font-semibold">
                Workspace Address
                <RequiredMark />
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border-ba-line text-base"
                  value={slug}
                  onChange={(e) => {
                    setSlugManual(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  title="Lowercase letters, numbers, and hyphens only"
                  autoComplete="off"
                />
                <span className="mt-1 block text-base font-normal text-ba-ink/70">
                  {slug || 'your-centre'}.{ROOT_DOMAIN}
                </span>
              </label>
              <label className="mt-4 block text-base font-semibold">
                Education Subtype
                <RequiredMark />
                <select
                  className="mt-1 w-full cursor-pointer rounded-md border-ba-line text-base"
                  value={educationSubtype}
                  onChange={(e) =>
                    setEducationSubtype(e.target.value as EducationSubtypeValue)
                  }
                  required
                >
                  {EDUCATION_SUBTYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {educationSubtype === 'OTHER' && (
                <label className="mt-4 block text-base font-semibold">
                  Describe Your Education Subtype
                  <RequiredMark />
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border-ba-line text-base"
                    value={educationSubtypeOther}
                    onChange={(e) => setEducationSubtypeOther(e.target.value)}
                    required
                  />
                </label>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? 'Creating…' : 'Create Organization'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="cursor-pointer rounded-md border border-ba-line px-4 py-3 text-base"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <p className="mt-6 text-base">
            {organization ? (
              <>
                <Link className="text-ba-accent underline" to="/app">
                  Back to App
                </Link>
                {' · '}
              </>
            ) : null}
            <button
              type="button"
              onClick={() => logout()}
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
