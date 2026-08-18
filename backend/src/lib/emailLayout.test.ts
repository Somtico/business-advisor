import {
  brandTextEmailSuffix,
  emailBulletList,
  emailPrimaryButtonHtml,
  emailStatTable,
  escapeEmailHtml,
  normalizePublicPortalOrigin,
  resolveEmailLogoUrl,
  wrapBrandedEmailHtml,
} from './emailLayout';

describe('emailLayout', () => {
  const originalFrontend = process.env.FRONTEND_URL;
  const originalLogo = process.env.BREVO_EMAIL_LOGO_URL;
  const originalSender = process.env.BREVO_SENDER_NAME;

  afterEach(() => {
    if (originalFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontend;
    if (originalLogo === undefined) delete process.env.BREVO_EMAIL_LOGO_URL;
    else process.env.BREVO_EMAIL_LOGO_URL = originalLogo;
    if (originalSender === undefined) delete process.env.BREVO_SENDER_NAME;
    else process.env.BREVO_SENDER_NAME = originalSender;
  });

  describe('escapeEmailHtml', () => {
    it('escapes HTML special characters', () => {
      expect(escapeEmailHtml(`<a href="x">O'Brien & Co</a>`)).toBe(
        '&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; Co&lt;/a&gt;'
      );
    });
  });

  describe('normalizePublicPortalOrigin', () => {
    it('strips www and api prefixes', () => {
      expect(normalizePublicPortalOrigin('https://www.businessadvisor.app')).toBe(
        'https://businessadvisor.app'
      );
      expect(normalizePublicPortalOrigin('https://api.businessadvisor.app')).toBe(
        'https://businessadvisor.app'
      );
    });

    it('rejects localhost', () => {
      expect(normalizePublicPortalOrigin('http://localhost:3007')).toBeNull();
    });
  });

  describe('resolveEmailLogoUrl', () => {
    it('prefers BREVO_EMAIL_LOGO_URL when set', () => {
      process.env.BREVO_EMAIL_LOGO_URL = 'https://cdn.example.com/logo.png';
      process.env.FRONTEND_URL = 'https://staging.businessadvisor.app';
      expect(resolveEmailLogoUrl()).toBe('https://cdn.example.com/logo.png');
    });

    it('uses a public FRONTEND_URL for the mark with cache bust', () => {
      delete process.env.BREVO_EMAIL_LOGO_URL;
      process.env.FRONTEND_URL = 'https://staging.businessadvisor.app/';
      expect(resolveEmailLogoUrl()).toBe(
        'https://staging.businessadvisor.app/images/logo/business-advisor-mark.png?v=20260817'
      );
    });

    it('falls back to production when FRONTEND_URL is unset', () => {
      delete process.env.BREVO_EMAIL_LOGO_URL;
      delete process.env.FRONTEND_URL;
      expect(resolveEmailLogoUrl()).toBe(
        'https://businessadvisor.app/images/logo/business-advisor-mark.png?v=20260817'
      );
    });

    it('ignores localhost FRONTEND_URL so mail clients can fetch the logo', () => {
      delete process.env.BREVO_EMAIL_LOGO_URL;
      process.env.FRONTEND_URL = 'http://localhost:3007';
      expect(resolveEmailLogoUrl()).toBe(
        'https://businessadvisor.app/images/logo/business-advisor-mark.png?v=20260817'
      );
    });
  });

  it('embeds the resolved logo URL, teal banner, and light-only colour scheme', () => {
    delete process.env.BREVO_EMAIL_LOGO_URL;
    process.env.FRONTEND_URL = 'https://staging.businessadvisor.app';
    const html = wrapBrandedEmailHtml({
      preheader: 'Confirm your inbox',
      cardTitle: 'Verify Your Email',
      contentHtml: '<p>Hello</p>',
    });
    expect(html).toContain(
      'src="https://staging.businessadvisor.app/images/logo/business-advisor-mark.png?v=20260817"'
    );
    expect(html).toContain('href="https://staging.businessadvisor.app"');
    expect(html).toContain('name="color-scheme" content="light only"');
    expect(html).toContain('class="email-logo"');
    expect(html).toContain('width="88"');
    expect(html).toContain('Verify Your Email');
    expect(html).toContain('Confirm your inbox');
    expect(html).toContain('bgcolor="#0d6e6e"');
    expect(html).toContain('Somtico Technologies Inc.');
    expect(html).toContain('https://somticoweb.com');
  });

  it('emailPrimaryButtonHtml uses spacer cells and the teal CTA', () => {
    const html = emailPrimaryButtonHtml(
      'https://businessadvisor.app/verify-email?token=abc',
      'Verify Email Address'
    );
    expect(html).toContain('bgcolor="#0d6e6e"');
    expect(html).toContain('class="email-cta"');
    expect(html).toContain('Verify Email Address');
    expect(html).toContain('border-radius:10px');
    expect(html).not.toContain('border:14px solid');
  });

  it('emailStatTable and emailBulletList escape values', () => {
    const stats = emailStatTable([{ label: 'Active Students', value: '12' }]);
    expect(stats).toContain('Active Students');
    expect(stats).toContain('12');
    expect(emailBulletList(['Cut <waste>'])).toContain('Cut &lt;waste&gt;');
    expect(emailBulletList([])).toContain('None');
  });

  it('brandTextEmailSuffix includes the public origin', () => {
    delete process.env.FRONTEND_URL;
    process.env.BREVO_SENDER_NAME = 'Somtico Business Advisor';
    const suffix = brandTextEmailSuffix();
    expect(suffix).toContain('Somtico Business Advisor');
    expect(suffix).toContain('https://businessadvisor.app');
    expect(suffix).toContain('Somtico Technologies Inc.');
  });
});
