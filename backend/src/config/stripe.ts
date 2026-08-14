import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-07-30.basil' as Stripe.LatestApiVersion,
    });
  }
  return stripe;
}

/** Pilot plan: $5 CAD / month */
export const PILOT_PRICE_LOOKUP_KEY = 'ba_pilot_monthly_cad_500';
export const PILOT_AMOUNT_CENTS = 500;
export const PILOT_CURRENCY = 'cad';
