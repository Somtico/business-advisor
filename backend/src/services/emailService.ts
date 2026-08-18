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

export function buildPasswordResetEmail(params: {
  firstName: string;
  resetUrl: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const name = params.firstName?.trim() || 'there';
  const subject = 'Somtico Business Advisor — Reset Your Password';
  const htmlContent = wrapBrandedEmailHtml({
    preheader: 'Reset your Somtico Business Advisor password.',
    cardTitle: 'Reset Your Password',
    contentHtml: `
      ${emailBodyParagraph(`Hello ${name},`)}
      ${emailBodyParagraph(
        'We received a request to reset the password for your Somtico Business Advisor account.'
      )}
      ${emailPrimaryButtonHtml(params.resetUrl, 'Reset Password')}
      ${emailBodyParagraph(
        'This link expires in 1 hour. If you did not request a reset, you can ignore this email.'
      )}
      ${emailRichParagraph(
        `Or copy this link: ${emailTextLink(params.resetUrl, params.resetUrl)}`
      )}
    `,
  });
  const textContent = `
Somtico Business Advisor — Reset Your Password

Hello ${name},

Reset your password:

${params.resetUrl}

This link expires in 1 hour. If you did not request a reset, you can ignore this email.
${brandTextEmailSuffix()}
  `.trim();
  return { subject, htmlContent, textContent };
}

export async function sendPasswordResetEmail(params: {
  email: string;
  firstName: string;
  resetUrl: string;
}): Promise<{ sent: boolean; dryRun: boolean }> {
  const built = buildPasswordResetEmail(params);
  return sendTransactionalEmail({
    toEmail: params.email,
    toName: params.firstName || 'there',
    subject: built.subject,
    htmlContent: built.htmlContent,
    textContent: built.textContent,
  });
}

export function buildInvitationEmail(params: {
  firstName?: string;
  organizationName: string;
  roleLabel: string;
  acceptUrl: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const name = params.firstName?.trim() || 'there';
  const subject = `You're Invited to ${params.organizationName} on Somtico Business Advisor`;
  const htmlContent = wrapBrandedEmailHtml({
    preheader: `Join ${params.organizationName} on Somtico Business Advisor.`,
    cardTitle: 'You Are Invited',
    contentHtml: `
      ${emailBodyParagraph(`Hello ${name},`)}
      ${emailBodyParagraph(
        `You have been invited to join ${params.organizationName} as ${params.roleLabel}.`
      )}
      ${emailPrimaryButtonHtml(params.acceptUrl, 'Accept Invitation')}
      ${emailBodyParagraph(
        'This link expires in 7 days. If you were not expecting this invitation, you can ignore this email.'
      )}
    `,
  });
  const textContent = `
You're invited to ${params.organizationName} on Somtico Business Advisor

Hello ${name},

You have been invited to join ${params.organizationName} as ${params.roleLabel}.

${params.acceptUrl}

This link expires in 7 days. If you were not expecting this invitation, you can ignore this email.
${brandTextEmailSuffix()}
  `.trim();
  return { subject, htmlContent, textContent };
}

export async function sendInvitationEmail(params: {
  email: string;
  firstName?: string;
  organizationName: string;
  roleLabel: string;
  acceptUrl: string;
}): Promise<{ sent: boolean; dryRun: boolean }> {
  const built = buildInvitationEmail(params);
  return sendTransactionalEmail({
    toEmail: params.email,
    toName: params.firstName || params.email,
    subject: built.subject,
    htmlContent: built.htmlContent,
    textContent: built.textContent,
  });
}
