import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  PrivacyDocumentBody,
  TermsDocumentBody,
} from '../content/legalDocuments';
import { RequiredMark } from '../lib/forms';

/**
 * Signup legal gate: scroll Terms + Privacy to the end before the accept
 * checkbox unlocks (same pattern as the Skill Samurai waiver).
 */
export function LegalAcceptScroll({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const checkScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 100;
      const noScrollNeeded = scrollHeight <= clientHeight + 4;
      if (isAtBottom || noScrollNeeded) {
        setHasScrolled(true);
      }
    };

    const timeoutId = window.setTimeout(checkScroll, 100);
    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);

    return () => {
      window.clearTimeout(timeoutId);
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, []);

  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold">Terms of Service and Privacy Policy</h2>
      <p className="mt-2 text-base text-ba-ink/70">
        Scroll through both documents below. The agreement checkbox unlocks when
        you reach the end.
      </p>

      <div
        ref={contentRef}
        className="mt-3 max-h-80 overflow-y-auto rounded-md border border-ba-line bg-ba-mist/30 p-4"
        tabIndex={0}
        aria-label="Terms of Service and Privacy Policy"
      >
        <TermsDocumentBody compact />
        <hr className="my-10 border-ba-line" />
        <PrivacyDocumentBody compact />
        <p className="mt-8 text-base font-semibold text-ba-ink/80">
          End of Terms of Service and Privacy Policy.
        </p>
      </div>

      {!hasScrolled && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-base text-amber-900">
          Please scroll through the entire Terms of Service and Privacy Policy
          above before agreeing.
        </p>
      )}

      <label
        className={`mt-4 flex items-start gap-3 text-base ${
          hasScrolled
            ? 'cursor-pointer'
            : 'cursor-not-allowed text-ba-ink/50'
        }`}
      >
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          disabled={!hasScrolled}
          required
          className="mt-1 rounded border-ba-line disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span>
          I have read and agree to the{' '}
          <Link
            className="text-ba-accent underline"
            to="/terms"
            target="_blank"
            rel="noreferrer"
          >
            Terms of Service
          </Link>{' '}
          and the{' '}
          <Link
            className="text-ba-accent underline"
            to="/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </Link>
          , including that AI Business Advisor provides information only, not
          professional advice, and that decisions and their outcomes remain my
          organization's responsibility.
          <RequiredMark />
        </span>
      </label>
    </div>
  );
}
