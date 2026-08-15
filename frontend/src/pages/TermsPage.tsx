import { PublicShell } from '../components/PublicShell';
import {
  LegalPageFooter,
  TERMS_VERSION,
  TermsDocumentBody,
} from '../content/legalDocuments';

export { TERMS_VERSION };

export function TermsPage() {
  return (
    <PublicShell compact>
      <div className="bg-ba-surface px-4 py-10">
        <div className="mx-auto max-w-3xl border border-ba-line bg-white p-8 md:p-10">
          <TermsDocumentBody />
          <LegalPageFooter active="terms" />
        </div>
      </div>
    </PublicShell>
  );
}
