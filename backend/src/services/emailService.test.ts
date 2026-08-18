import { buildVerificationEmail } from './emailService';

describe('buildVerificationEmail', () => {
  const originalFrontend = process.env.FRONTEND_URL;
  const originalLogo = process.env.BREVO_EMAIL_LOGO_URL;

  afterEach(() => {
    if (originalFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontend;
    if (originalLogo === undefined) delete process.env.BREVO_EMAIL_LOGO_URL;
    else process.env.BREVO_EMAIL_LOGO_URL = originalLogo;
  });

  it('wraps the verification message in the branded shell with a CTA', () => {
    delete process.env.BREVO_EMAIL_LOGO_URL;
    process.env.FRONTEND_URL = 'https://businessadvisor.app';
    const built = buildVerificationEmail({
      firstName: 'Ada',
      verificationUrl: 'https://businessadvisor.app/verify-email?token=abc',
    });
    expect(built.subject).toBe('Somtico Business Advisor — Verify Your Email');
    expect(built.htmlContent).toContain('<!DOCTYPE html>');
    expect(built.htmlContent).toContain('Verify Your Email');
    expect(built.htmlContent).toContain('Hello Ada,');
    expect(built.htmlContent).toContain('class="email-cta"');
    expect(built.htmlContent).toContain('Verify Email Address');
    expect(built.htmlContent).toContain(
      'https://businessadvisor.app/verify-email?token=abc'
    );
    expect(built.htmlContent).toContain('business-advisor-mark.png');
    expect(built.textContent).toContain('https://businessadvisor.app/verify-email?token=abc');
    expect(built.textContent).toContain('Hello Ada,');
  });

  it('escapes a first name that contains HTML', () => {
    const built = buildVerificationEmail({
      firstName: '<script>alert(1)</script>',
      verificationUrl: 'https://businessadvisor.app/verify-email?token=abc',
    });
    expect(built.htmlContent).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(built.htmlContent).not.toContain('<script>alert(1)</script>');
  });
});
