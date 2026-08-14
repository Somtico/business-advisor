import { Navigate, Route, Routes } from 'react-router';
import { AppShell, RequireAuth } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ReadinessPage } from './pages/ReadinessPage';
import { ProgrammesPage } from './pages/ProgrammesPage';
import { StaffingPage } from './pages/StaffingPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { TargetsPage } from './pages/TargetsPage';
import { ActionsPage } from './pages/ActionsPage';
import { AdvisorPage } from './pages/AdvisorPage';
import { PricingPage } from './pages/PricingPage';
import { SettingsPage } from './pages/SettingsPage';
import { TermsPage } from './pages/TermsPage';
import { HelpPage } from './pages/HelpPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="readiness" element={<ReadinessPage />} />
        <Route path="programmes" element={<ProgrammesPage />} />
        <Route path="staffing" element={<StaffingPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="targets" element={<TargetsPage />} />
        <Route path="actions" element={<ActionsPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="advisor" element={<AdvisorPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
