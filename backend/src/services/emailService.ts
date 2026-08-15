/**
 * Transactional email via Brevo (same transport as weekly briefs).
 * When BREVO_API_KEY is unset, messages are logged and treated as dry-run success.
 */

const SENDER_EMAIL =
  process.env.BREVO_SENDER_EMAIL || 'noreply@businessadvisor.app';
const SENDER_NAME = process.env.BREVO_SENDER_NAME || 'AI Business Advisor';

async function sendBrevoEmail(params: {
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

export async function sendVerificationEmail(params: {
  email: string;
  firstName: string;
  verificationUrl: string;
}): Promise<{ sent: boolean; dryRun: boolean }> {
  const name = params.firstName || 'there';
  const subject = 'AI Business Advisor — Verify Your Email';
  const htmlContent = `
    <p style="color:#333;line-height:1.6">Hello ${name},</p>
    <p style="color:#333;line-height:1.6">
      Thanks for creating an AI Business Advisor account. Verify your email to sign in
      by clicking the button below.
    </p>
    <p style="text-align:center;margin:28px 0">
      <a href="${params.verificationUrl}"
         style="background:#0f4c5c;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
        Verify Email Address
      </a>
    </p>
    <p style="color:#333;line-height:1.6">
      This link expires in 24 hours. If you did not create an account, you can ignore this email.
    </p>
    <p style="color:#555;font-size:14px;line-height:1.6">
      Or copy this link: ${params.verificationUrl}
    </p>
    <p style="color:#777;font-size:12px;margin-top:24px">
      © ${new Date().getFullYear()} Somtico Tech. This is an automated message.
    </p>
  `;
  const textContent = `
AI Business Advisor — Verify Your Email

Hello ${name},

Thanks for creating an AI Business Advisor account. Verify your email to sign in:

${params.verificationUrl}

This link expires in 24 hours. If you did not create an account, you can ignore this email.

© ${new Date().getFullYear()} Somtico Tech
  `.trim();

  return sendBrevoEmail({
    toEmail: params.email,
    toName: name,
    subject,
    htmlContent,
    textContent,
  });
}
