import { Link, NavLink, Outlet, Navigate } from 'react-router';
import { BrandMark } from './BrandMark';
import { AI_NAME_INTRO } from '../content/product';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/app', label: 'Command Centre', end: true },
  { to: '/app/readiness', label: 'Data Readiness' },
  { to: '/app/programmes', label: 'Programmes & Students' },
  { to: '/app/staffing', label: 'Staffing' },
  { to: '/app/expenses', label: 'Expenses & Subscriptions' },
  { to: '/app/targets', label: 'Targets & Forecasts' },
  { to: '/app/actions', label: 'Action Centre' },
  { to: '/app/pricing', label: 'Pricing Advisor' },
  { to: '/app/enrolment', label: 'Enrolment Advisor' },
  { to: '/app/advisor', label: 'Ask Chuk' },
  { to: '/app/help', label: 'Help & FAQ' },
  { to: '/app/settings', label: 'Settings' },
];

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  if (!accessToken) return <Navigate to="/login" replace />;
  return children;
}

export function AppShell() {
  const { organization, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-ba-surface text-ba-ink">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-ba-line bg-white md:flex md:flex-col">
          <div className="border-b border-ba-line px-5 py-6">
            <BrandMark to="/app" size={36} />
            <p className="mt-2 text-base text-ba-ink/70">
              {organization?.name || 'Organization'}
            </p>
            <p className="mt-1 text-base text-ba-ink/60">
              {AI_NAME_INTRO} in this product. It is software, not a person.
            </p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-3">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `cursor-pointer rounded-md px-3 py-2 text-base ${
                    isActive
                      ? 'bg-ba-mist font-semibold text-ba-accent'
                      : 'text-ba-ink/80 hover:bg-ba-mist/70'
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-ba-line p-4">
            <p className="text-base">
              {user?.firstName} {user?.lastName}
            </p>
            <button
              type="button"
              onClick={logout}
              className="mt-2 cursor-pointer text-base text-ba-warm underline"
            >
              Sign Out
            </button>
          </div>
        </aside>
        <main className="flex-1 overflow-auto">
          <div className="border-b border-ba-line bg-white px-4 py-3 md:hidden">
            <BrandMark to="/app" size={32} />
            <p className="mt-1 text-base text-ba-ink/60">
              {AI_NAME_INTRO} in this product. It is software, not a person.
            </p>
          </div>
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
            <Outlet />
            <footer className="mt-12 border-t border-ba-line pt-4 text-base text-ba-ink/70">
              <p className="flex flex-wrap gap-x-4 gap-y-1">
                <Link className="text-ba-accent underline" to="/terms">
                  Terms of Service
                </Link>
                <Link className="text-ba-accent underline" to="/privacy">
                  Privacy Policy
                </Link>
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
