interface InactivityWarningModalProps {
  remainingSeconds: number;
  onExtendSession: () => void;
  onLogout: () => void;
}

export function InactivityWarningModal({
  remainingSeconds,
  onExtendSession,
  onLogout,
}: InactivityWarningModalProps) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ba-ink/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
    >
      <div className="w-full max-w-md border border-ba-line bg-white p-6 shadow-lg">
        <h2
          id="session-timeout-title"
          className="font-display text-2xl font-bold text-ba-ink"
        >
          Session Timeout Warning
        </h2>
        <p className="mt-3 text-base text-ba-ink/80">
          You will be signed out due to inactivity in:
        </p>
        <p
          className="mt-4 text-center font-display text-4xl font-bold text-ba-warm"
          aria-live="polite"
        >
          {formattedTime}
        </p>
        <p className="mt-4 text-base text-ba-ink/70">
          This protects your financial records if you step away from this
          device.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onExtendSession}
            className="cursor-pointer rounded-md bg-ba-accent px-4 py-3 text-base font-semibold text-white"
          >
            Stay Signed In
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="cursor-pointer rounded-md border border-ba-line px-4 py-3 text-base font-semibold text-ba-ink"
          >
            Sign Out Now
          </button>
        </div>
      </div>
    </div>
  );
}
