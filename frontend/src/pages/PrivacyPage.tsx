import { PublicShell } from '../components/PublicShell';
import {
  LegalPageFooter,
  PRIVACY_VERSION,
  PrivacyDocumentBody,
} from '../content/legalDocuments';

export { PRIVACY_VERSION };

export function PrivacyPage() {
  return (
    <PublicShell compact>
      <div className="bg-ba-surface px-4 py-10">
        <div className="mx-auto max-w-3xl border border-ba-line bg-white p-8 md:p-10">
          <PrivacyDocumentBody />
          <LegalPageFooter active="privacy" />
        </div>
      </div>
    </PublicShell>
  );
}
