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
import { EmailVerificationPage } from './pages/EmailVerificationPage';
import { LandingPage } from './pages/LandingPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { EnrolmentPage } from './pages/EnrolmentPage';
import { AiUsagePage } from './pages/AiUsagePage';
import { ChooseWorkspacePage } from './pages/ChooseWorkspacePage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/workspaces" element={<WorkspacesPage />} />
      <Route path="/choose-workspace" element={<ChooseWorkspacePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/verify-email" element={<EmailVerificationPage />} />
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
        <Route path="enrolment" element={<EnrolmentPage />} />
        <Route path="advisor" element={<AdvisorPage />} />
        <Route path="ai-usage" element={<AiUsagePage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
