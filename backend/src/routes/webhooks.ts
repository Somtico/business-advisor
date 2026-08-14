import { Router, Request, Response } from 'express';
import { getStripe, isStripeConfigured } from '../config/stripe';
import { handleStripeWebhookEvent } from '../services/billingService';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    if (!isStripeConfigured()) {
      res.status(200).json({ received: true, skipped: true });
      return;
    }
    const sig = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig || !secret) {
      res.status(400).send('Missing stripe signature or webhook secret');
      return;
    }
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      secret
    );
    await handleStripeWebhookEvent(
      event as unknown as {
        type: string;
        data: { object: Record<string, unknown> };
      }
    );
    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error', err);
    res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
});

export default router;
