/**
 * Branded HTML shell for Brevo transactional email (table layout, inline styles).
 * Matches Somtico Business Advisor: navy ink, teal accent, warm highlight, mist surfaces.
 *
 * The header sits the product mark on a white plate so Gmail / Outlook dark mode
 * does not invert the lantern. `color-scheme: light only` keeps the rest of the
 * message on the light theme.
 */

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const DISPLAY_STACK = 'Georgia, "Times New Roman", Times, serif';

/** Product tokens from frontend/tailwind.config.js (`ba.*`). */
const INK = '#0f2744';
const DEEP = '#081629';
const MIST = '#eef4f8';
const SURFACE = '#f7fafc';
const ACCENT = '#0d6e6e';
const ACCENT_DARK = '#0a5757';
const WARM = '#c45c26';
const LINE = '#d5e0e8';
const CARD_BG = '#ffffff';
const MUTED = '#5a6f82';
const CTA_BUTTON_BG = '#0d6e6e';
const CTA_BUTTON_RADIUS = '10px';
const CTA_FONT_SIZE = '16px';
const CTA_LINE_HEIGHT = '20px';
const CONTENT_GUTTER = 32;

const PRODUCTION_PORTAL_URL = 'https://businessadvisor.app';
const EMAIL_LOGO_PATH = '/images/logo/business-advisor-mark.png';
/** Bump when replacing the asset so Gmail/Outlook proxies refetch. */
const EMAIL_LOGO_CACHE_BUST = '20260817';
const PRODUCT_NAME = 'Somtico Business Advisor';
const COMPANY_NAME = 'Somtico Technologies Inc.';
const COMPANY_SITE = 'https://somticoweb.com';

function productName(): string {
  return (process.env.BREVO_SENDER_NAME || PRODUCT_NAME).trim();
}

function siteBaseUrl(): string {
  return (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
}

function isPublicHttpOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (host.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizePublicPortalOrigin(url: string): string | null {
  if (!url || !isPublicHttpOrigin(url)) return null;
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    if (host.startsWith('api.')) host = host.slice(4);
    return `${parsed.protocol}//${host}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** Public origin for email links and images. Never uses localhost FRONTEND_URL. */
export function publicEmailSiteBaseUrl(): string {
  return normalizePublicPortalOrigin(siteBaseUrl()) || PRODUCTION_PORTAL_URL;
}

/** Absolute URL for the email header image (mail clients fetch at open time). */
export function resolveEmailLogoUrl(): string {
  const explicit = (process.env.BREVO_EMAIL_LOGO_URL || '').trim();
  if (explicit) return explicit;

  return `${publicEmailSiteBaseUrl()}${EMAIL_LOGO_PATH}?v=${EMAIL_LOGO_CACHE_BUST}`;
}

export type BrandedEmailOptions = {
  preheader?: string;
  /** Title in the teal banner (plain text, escaped). */
  cardTitle?: string;
  contentHtml: string;
  footerExtraHtml?: string;
};

export function wrapBrandedEmailHtml(opts: BrandedEmailOptions): string {
  const pre = opts.preheader ? escapeEmailHtml(opts.preheader) : '';
  const bannerTitle = opts.cardTitle
    ? `<h1 style="margin:0;font-family:${FONT_STACK};font-size:24px;font-weight:700;color:#ffffff;line-height:1.3">${escapeEmailHtml(opts.cardTitle)}</h1>`
    : '';
  const base = publicEmailSiteBaseUrl();
  const logo = escapeEmailHtml(resolveEmailLogoUrl());
  const product = escapeEmailHtml(productName());
  const company = escapeEmailHtml(COMPANY_NAME);
  const companyHref = escapeEmailHtml(COMPANY_SITE);
  const portalHref = escapeEmailHtml(base);

  const logoBlock = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" class="email-logo-plate" bgcolor="${CARD_BG}" style="margin:0 auto;border-collapse:collapse;background-color:${CARD_BG} !important">
  <tr>
    <td align="center" bgcolor="${CARD_BG}" class="email-logo-plate" style="padding:8px 16px 4px;background-color:${CARD_BG} !important">
      <a href="${portalHref}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;background-color:${CARD_BG}">
        <img src="${logo}" alt="${product}" width="88" height="88" class="email-logo" style="display:block;margin:0 auto;max-width:88px;width:88px;height:auto;border:0;outline:none;text-decoration:none;background-color:${CARD_BG} !important;-ms-interpolation-mode:bicubic;" />
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" bgcolor="${CARD_BG}" style="padding:4px 16px 8px;background-color:${CARD_BG} !important">
      <a href="${portalHref}" target="_blank" rel="noopener noreferrer" style="font-family:${DISPLAY_STACK};font-size:20px;font-weight:700;color:${INK};text-decoration:none;letter-spacing:-0.02em">${product}</a>
    </td>
  </tr>
</table>`;

  const visitSiteBlock = `<p style="margin:0 0 8px"><a href="${portalHref}" style="color:${ACCENT};text-decoration:underline">Visit Business Advisor</a></p>`;
  const extra = opts.footerExtraHtml ? opts.footerExtraHtml : '';
  const year = new Date().getFullYear();

  const titleBanner = bannerTitle
    ? `<tr>
          <td align="center" bgcolor="${ACCENT}" style="padding:22px 28px;text-align:center;background-color:${ACCENT};background-image:linear-gradient(135deg,${ACCENT_DARK} 0%,${ACCENT} 100%);">
            ${bannerTitle}
          </td>
        </tr>`
    : `<tr>
          <td bgcolor="${ACCENT_DARK}" style="height:4px;line-height:4px;font-size:0;background-color:${ACCENT};background-image:linear-gradient(90deg,${ACCENT_DARK} 0%,${ACCENT} 50%,${WARM} 100%);">&nbsp;</td>
        </tr>`;

  return `<!DOCTYPE html>
<html lang="en-CA" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<style type="text/css">
:root {
  color-scheme: light only;
  supported-color-schemes: light;
}
body, table, td, div, p, a, span {
  color-scheme: light only;
}
a.email-cta,
a.email-cta:link,
a.email-cta:visited,
a.email-cta:hover,
a.email-cta:active {
  text-decoration: none !important;
  color: #ffffff !important;
}
@media (prefers-color-scheme: dark) {
  .email-logo-plate,
  .email-logo-plate td,
  .email-logo {
    background-color: #ffffff !important;
  }
}
[data-ogsc] .email-logo-plate,
[data-ogsc] .email-logo,
[data-ogsb] .email-logo-plate,
[data-ogsb] .email-logo {
  background-color: #ffffff !important;
}
</style>
<!--[if mso]>
<style type="text/css">
  body, table, td { background-color: #ffffff !important; }
</style>
<![endif]-->
<title>${product}</title>
</head>
<body class="email-body" bgcolor="${SURFACE}" style="margin:0;padding:0;background-color:${SURFACE};color-scheme:light only;">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:transparent">${pre}</div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${SURFACE}" style="background-color:${SURFACE};border-collapse:collapse">
  <tr>
    <td align="center" style="padding:28px 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse">
        <tr>
          <td align="center" bgcolor="${CARD_BG}" class="email-logo-plate" style="padding:24px 28px 16px;background-color:${CARD_BG} !important;border:1px solid ${LINE};border-bottom:0;border-radius:12px 12px 0 0">
            ${logoBlock}
          </td>
        </tr>
        ${titleBanner}
        <tr>
          <td bgcolor="${CARD_BG}" style="background-color:${CARD_BG};border:1px solid ${LINE};border-top:0;border-radius:0 0 12px 12px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse">
              <tr>
                <td colspan="3" height="28" style="height:28px;line-height:28px;font-size:0">&nbsp;</td>
              </tr>
              <tr>
                <td width="${CONTENT_GUTTER}" style="width:${CONTENT_GUTTER}px;font-size:0;line-height:0">&nbsp;</td>
                <td style="font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${INK}">
                  ${opts.contentHtml}
                </td>
                <td width="${CONTENT_GUTTER}" style="width:${CONTENT_GUTTER}px;font-size:0;line-height:0">&nbsp;</td>
              </tr>
              <tr>
                <td colspan="3" height="32" style="height:32px;line-height:32px;font-size:0">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 16px 8px;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${MUTED};text-align:center">
            ${visitSiteBlock}
            <p style="margin:0 0 8px">${product} is a product of <a href="${companyHref}" style="color:${ACCENT};text-decoration:underline">${company}</a>.</p>
            ${extra}
            <p style="margin:16px 0 0;font-size:11px;color:${MUTED}">This is an automated message from ${product}. Contact us if you did not expect it.</p>
            <p style="margin:8px 0 0;font-size:11px;color:${MUTED}">&copy; ${year} ${company}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function emailPrimaryButtonHtml(href: string, label: string): string {
  const h = escapeEmailHtml(href);
  const l = escapeEmailHtml(label);
  const bg = CTA_BUTTON_BG;
  const r = CTA_BUTTON_RADIUS;
  const cellBg = `background-color:${bg}`;

  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin:28px auto;border-collapse:separate;border-spacing:0">
  <tr>
    <td align="center">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${h}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="18%" strokecolor="${bg}" fillcolor="${bg}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:${CTA_FONT_SIZE};font-weight:bold;">${l}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0">
        <tr>
          <td align="center" bgcolor="${bg}" style="${cellBg};border-radius:${r};overflow:hidden">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0" bgcolor="${bg}" style="border-collapse:separate;border-spacing:0;${cellBg}">
              <tr>
                <td colspan="3" height="14" style="height:14px;line-height:14px;font-size:0;${cellBg}">&nbsp;</td>
              </tr>
              <tr>
                <td width="28" style="width:28px;font-size:0;line-height:0;${cellBg}">&nbsp;</td>
                <td align="center" bgcolor="${bg}" style="${cellBg}">
                  <a class="email-cta" href="${h}" target="_blank" rel="noopener noreferrer" style="color:#ffffff;font-family:${FONT_STACK};font-size:${CTA_FONT_SIZE};font-weight:700;line-height:${CTA_LINE_HEIGHT};text-decoration:none;white-space:nowrap">${l}</a>
                </td>
                <td width="28" style="width:28px;font-size:0;line-height:0;${cellBg}">&nbsp;</td>
              </tr>
              <tr>
                <td colspan="3" height="14" style="height:14px;line-height:14px;font-size:0;${cellBg}">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

export function emailTextLink(href: string, label: string): string {
  return `<a href="${escapeEmailHtml(href)}" style="color:${ACCENT};text-decoration:underline">${escapeEmailHtml(label)}</a>`;
}

export function emailSectionHeading(title: string): string {
  return `<p style="margin:24px 0 10px;font-family:${FONT_STACK};font-size:18px;font-weight:700;color:${INK};line-height:1.3">${escapeEmailHtml(title)}</p>`;
}

export function emailBodyParagraph(text: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${INK}">${escapeEmailHtml(text)}</p>`;
}

export function emailRichParagraph(innerHtml: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${INK}">${innerHtml}</p>`;
}

export function emailHighlightBox(innerHtml: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border-collapse:collapse">
  <tr>
    <td style="background-color:${MIST};border-left:4px solid ${ACCENT};border-radius:8px;padding:14px 16px;font-family:${FONT_STACK};font-size:16px;line-height:1.6;color:${INK}">
      ${innerHtml}
    </td>
  </tr>
</table>`;
}

export function emailStatTable(
  rows: Array<{ label: string; value: string }>
): string {
  const body = rows
    .map(
      (row, index) => `<tr>
      <td style="padding:10px 0;font-family:${FONT_STACK};font-size:16px;color:${MUTED};border-top:${index === 0 ? '0' : `1px solid ${LINE}`}">${escapeEmailHtml(row.label)}</td>
      <td align="right" style="padding:10px 0;font-family:${FONT_STACK};font-size:16px;font-weight:700;color:${INK};border-top:${index === 0 ? '0' : `1px solid ${LINE}`}">${escapeEmailHtml(row.value)}</td>
    </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;border-collapse:collapse">${body}</table>`;
}

export function emailBulletList(items: string[]): string {
  if (!items.length) {
    return emailBodyParagraph('None');
  }
  const lis = items
    .map(
      (item) =>
        `<li style="margin:0 0 8px;font-family:${FONT_STACK};font-size:16px;line-height:1.5;color:${INK}">${escapeEmailHtml(item)}</li>`
    )
    .join('');
  return `<ul style="margin:0 0 12px;padding-left:20px">${lis}</ul>`;
}

export function emailFinePrint(text: string): string {
  return `<p style="margin:16px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${MUTED}">${escapeEmailHtml(text)}</p>`;
}

export function brandTextEmailSuffix(): string {
  const product = productName();
  const base = publicEmailSiteBaseUrl();
  return `\n—\n${product}\n${base}\nA product of ${COMPANY_NAME}\n`;
}

export const EMAIL_BRAND = {
  ink: INK,
  deep: DEEP,
  mist: MIST,
  surface: SURFACE,
  accent: ACCENT,
  warm: WARM,
  line: LINE,
  productName: PRODUCT_NAME,
  companyName: COMPANY_NAME,
  companySite: COMPANY_SITE,
  productionPortalUrl: PRODUCTION_PORTAL_URL,
} as const;
