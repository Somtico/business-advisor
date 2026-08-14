import { useState } from 'react';

const eyeSlashSvg = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 1.02-2.93 2.94-5.13 5.06-6.46" />
    <path d="M1 1l22 22" />
    <path d="M10.58 10.58a3 3 0 0 0 4.24 4.24" />
    <path d="M9.88 4.12A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8-.65 1.87-1.72 3.5-3.06 4.76" />
  </svg>
);

type PasswordFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
  showPassword?: boolean;
  onToggleShow?: () => void;
};

export function PasswordField({
  id,
  value,
  onChange,
  required,
  autoComplete,
  showPassword: controlledShow,
  onToggleShow,
}: PasswordFieldProps) {
  const [internalShow, setInternalShow] = useState(false);
  const show = controlledShow ?? internalShow;
  const toggle =
    onToggleShow ?? (() => setInternalShow((prev) => !prev));

  return (
    <div className="relative mt-1">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="w-full rounded-md border-ba-line py-2 pl-3 pr-10 text-base"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-transparent p-1 text-ba-ink/60"
        onClick={toggle}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? '👁️' : eyeSlashSvg}
      </button>
    </div>
  );
}
