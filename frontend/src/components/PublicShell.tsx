import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandMark } from './BrandMark';
import {
  COMPANY_NAME,
  COMPANY_SITE,
  PRODUCT_NAME,
} from '../content/product';

export function PublicShell({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-ba-surface text-ba-ink">
      <header className="sticky top-0 z-40 border-b border-ba-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <BrandMark to="/" />
          <nav className="flex flex-wrap items-center gap-2 text-base">
            {!compact && (
              <>
                <a
                  href="#how-it-works"
                  className="cursor-pointer px-2 py-1 text-ba-ink/80 hover:text-ba-accent"
                >
                  How It Works
                </a>
                <a
                  href="#screenshots"
                  className="cursor-pointer px-2 py-1 text-ba-ink/80 hover:text-ba-accent"
                >
                  Screenshots
                </a>
                <a
                  href="#faq"
                  className="cursor-pointer px-2 py-1 text-ba-ink/80 hover:text-ba-accent"
                >
                  FAQ
                </a>
              </>
            )}
            <Link
              to="/login"
              className="cursor-pointer px-3 py-2 font-semibold text-ba-ink/80 hover:text-ba-accent"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="cursor-pointer rounded-md bg-ba-accent px-4 py-2 font-semibold text-white"
            >
              Start Pilot
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-ba-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-base text-ba-ink/70 md:flex-row md:items-center md:justify-between md:px-8">
          <p>
            {PRODUCT_NAME} is a product of {COMPANY_NAME}.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link className="text-ba-accent underline" to="/terms">
              Terms of Service
            </Link>
            <Link className="text-ba-accent underline" to="/privacy">
              Privacy Policy
            </Link>
            <Link className="text-ba-accent underline" to="/login">
              Sign In
            </Link>
            <a
              className="text-ba-accent underline"
              href={COMPANY_SITE}
              target="_blank"
              rel="noreferrer"
            >
              {COMPANY_NAME}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
