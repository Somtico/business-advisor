/**
 * Transactional email via Brevo.
 * When BREVO_API_KEY is unset, messages are logged and treated as dry-run success.
 */

import {
  brandTextEmailSuffix,
  emailBodyParagraph,
  emailPrimaryButtonHtml,
  emailRichParagraph,
  emailTextLink,
  wrapBrandedEmailHtml,
} from '../lib/emailLayout';

const SENDER_EMAIL =
  process.env.BREVO_SENDER_EMAIL || 'noreply@businessadvisor.app';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Somtico Business Advisor';

export async function sendTransactionalEmail(params: {
  toEmail: string;
  toName: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}): Promise<{ sent: boolean; dryRun: boolean }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(
      `[email:dry-run] ${params.subject} -> ${params.toEmail}\n${params.textContent}`
    );
    return { sent: false, dryRun: true };
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: params.toEmail, name: params.toName }],
      subject: params.subject,
      htmlContent: params.htmlContent,
      textContent: params.textContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[email] Brevo failed ${res.status}: ${body}`);
    return { sent: false, dryRun: false };
  }
  return { sent: true, dryRun: false };
}

export function buildVerificationEmail(params: {
  firstName: string;
  verificationUrl: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const name = params.firstName?.trim() || 'there';
  const subject = 'Somtico Business Advisor — Verify Your Email';
  const htmlContent = wrapBrandedEmailHtml({
    preheader: 'Verify your email to finish setting up Somtico Business Advisor.',
    cardTitle: 'Verify Your Email',
    contentHtml: `
      ${emailBodyParagraph(`Hello ${name},`)}
      ${emailBodyParagraph(
        'Thanks for creating a Somtico Business Advisor account. Verify your email to sign in by clicking the button below.'
      )}
      ${emailPrimaryButtonHtml(params.verificationUrl, 'Verify Email Address')}
      ${emailBodyParagraph(
        'This link expires in 24 hours. If you did not create an account, you can ignore this email.'
      )}
      ${emailRichParagraph(
        `Or copy this link: ${emailTextLink(params.verificationUrl, params.verificationUrl)}`
      )}
    `,
  });
  const textContent = `
Somtico Business Advisor — Verify Your Email

Hello ${name},

Thanks for creating a Somtico Business Advisor account. Verify your email to sign in:

${params.verificationUrl}

This link expires in 24 hours. If you did not create an account, you can ignore this email.
${brandTextEmailSuffix()}
  `.trim();

  return { subject, htmlContent, textContent };
}

export async function sendVerificationEmail(params: {
  email: string;
  firstName: string;
  verificationUrl: string;
}): Promise<{ sent: boolean; dryRun: boolean }> {
  const name = params.firstName || 'there';
  const built = buildVerificationEmail({
    firstName: params.firstName,
    verificationUrl: params.verificationUrl,
  });

  return sendTransactionalEmail({
    toEmail: params.email,
    toName: name,
    subject: built.subject,
    htmlContent: built.htmlContent,
    textContent: built.textContent,
  });
}
