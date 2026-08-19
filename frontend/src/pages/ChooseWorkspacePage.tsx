import { Navigate } from 'react-router';

/** Kept so older bookmarks still reach the account workspace screen. */
export function ChooseWorkspacePage() {
  return <Navigate to="/workspaces" replace />;
}
