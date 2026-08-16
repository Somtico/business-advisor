import { createHmac } from 'crypto';

/**
 * HMAC contributor key for privacy-safe learning rows.
 * Allows withdrawal cleanup without storing organizationId on anonymized tables.
 */
export function contributorKeyForOrganization(organizationId: string): string {
  const salt =
    process.env.LEARNING_CONTRIBUTOR_SALT ||
    process.env.JWT_SECRET ||
    'business-advisor-dev-learning-salt';
  return createHmac('sha256', salt).update(`org:${organizationId}`).digest('hex');
}
