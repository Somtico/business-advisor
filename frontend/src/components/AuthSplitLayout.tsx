import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BrandMark } from './BrandMark';
import {
  COMPANY_NAME,
  COMPANY_SITE,
  PRODUCT_NAME,
  authShowcase,
} from '../content/product';

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-0.5 h-5 w-5 shrink-0 text-ba-ink"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M7.7 13.3 4.9 10.5l-1.4 1.4 4.2 4.2 8.5-8.5-1.4-1.4z"
      />
    </svg>
  );
}

/** Line-art command centre: programmes, a weekly chart, and a simple roster. */
export function AuthShowcaseArt() {
  return (
    <svg
      viewBox="0 0 420 280"
      className="mx-auto w-full max-w-md"
      role="img"
      aria-label="Illustration of an after-school command centre with a chart, ledger, and students"
    >
      <ellipse cx="210" cy="248" rx="150" ry="16" fill="#0d6e6e" opacity="0.12" />
      <rect
        x="48"
        y="36"
        width="200"
        height="132"
        rx="10"
        fill="#f7fafc"
        stroke="#0f2744"
        strokeWidth="2.25"
      />
      <path
        d="M68 148h160M88 148v-72M128 148v-48M168 148v-88M208 148v-36"
        stroke="#0d6e6e"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle cx="232" cy="56" r="14" fill="#0d6e6e" />
      <path
        d="M226 56.5 230.5 61l8-9"
        fill="none"
        stroke="#f7fafc"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="268"
        y="88"
        width="108"
        height="80"
        rx="8"
        fill="#f7fafc"
        stroke="#0f2744"
        strokeWidth="2.25"
      />
      <path
        d="M284 112h76M284 128h60M284 144h48"
        stroke="#0f2744"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
      <g fill="none" stroke="#0f2744" strokeWidth="2.25" strokeLinecap="round">
        <circle cx="108" cy="200" r="12" />
        <path d="M90 238c2-22 10-32 18-32s16 10 18 32" />
        <circle cx="168" cy="194" r="13" />
        <path d="M148 238c3-24 12-36 20-36s17 12 20 36" />
        <circle cx="230" cy="202" r="11" />
        <path d="M214 238c2-20 10-30 16-30s14 10 16 30" />
      </g>
      <circle
        cx="318"
        cy="204"
        r="26"
        fill="#f7fafc"
        stroke="#0d6e6e"
        strokeWidth="2.25"
      />
      <path
        d="M306 204c0-8 5.5-14 12-14s12 6 12 14-5.5 14-12 14-12-6-12-14z"
        fill="none"
        stroke="#0d6e6e"
        strokeWidth="2"
      />
      <path
        d="M318 194v20"
        stroke="#0d6e6e"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AuthShowcase() {
  return (
    <aside className="relative hidden p-6 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-3xl bg-gradient-to-b from-[#e7f3f2] to-[#cfe4e3] px-10 py-10">
        <BrandMark to="/" size={36} wordmark={PRODUCT_NAME} />
        <div className="mt-10 flex flex-1 flex-col justify-center">
          <AuthShowcaseArt />
          <p className="mt-8 font-display text-4xl font-bold leading-tight text-ba-ink">
            {authShowcase.headline}
          </p>
          <ul className="mt-8 space-y-4">
            {authShowcase.points.map((point) => (
              <li key={point} className="flex gap-3 text-base text-ba-ink">
                <CheckIcon />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 text-base text-ba-ink/80">{authShowcase.trust}</p>
      </div>
    </aside>
  );
}

export function AuthSplitLayout({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const formWidth = wide ? 'max-w-xl' : 'max-w-md';
  return (
    <div className="min-h-screen bg-white text-ba-ink lg:grid lg:grid-cols-2">
      <AuthShowcase />
      <div className="flex min-h-screen flex-col px-4 py-8 sm:px-8 lg:px-12">
        <div className="mb-8 lg:hidden">
          <BrandMark to="/" size={36} />
        </div>
        <div className={`mx-auto flex w-full ${formWidth} flex-1 flex-col justify-center`}>
          {children}
        </div>
        <p className={`mx-auto mt-8 w-full ${formWidth} text-base text-ba-ink/70`}>
          {PRODUCT_NAME} is a product of{' '}
          <a
            className="text-ba-accent underline"
            href={COMPANY_SITE}
            target="_blank"
            rel="noreferrer"
          >
            {COMPANY_NAME}
          </a>
          .{' '}
          <Link className="text-ba-accent underline" to="/terms">
            Terms of Service
          </Link>
          {' · '}
          <Link className="text-ba-accent underline" to="/privacy">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
