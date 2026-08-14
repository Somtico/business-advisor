import prisma from '../config/prisma';
import {
  getStripe,
  isStripeConfigured,
  PILOT_AMOUNT_CENTS,
  PILOT_CURRENCY,
  PILOT_PRICE_LOOKUP_KEY,
} from '../config/stripe';
import { activateOrganizationDev } from './authService';
import { writeAudit } from './auditService';

async function ensurePilotPriceId(): Promise<string> {
  const stripe = getStripe();
  const existing = await stripe.prices.list({
    lookup_keys: [PILOT_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0].id;

  const product = await stripe.products.create({
    name: 'Business Advisor Pilot',
    metadata: { plan: 'PILOT' },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: PILOT_CURRENCY,
    unit_amount: PILOT_AMOUNT_CENTS,
    recurring: { interval: 'month' },
    lookup_key: PILOT_PRICE_LOOKUP_KEY,
  });
  return price.id;
}

export async function createPilotCheckoutSession(params: {
  organizationId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string | null; simulated?: boolean }> {
  if (!isStripeConfigured()) {
    await activateOrganizationDev(params.organizationId);
    await writeAudit({
      organizationId: params.organizationId,
      action: 'billing.dev_activated',
      resourceType: 'PlatformSubscription',
    });
    return { url: null, simulated: true };
  }

  const stripe = getStripe();
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
    include: { subscription: true },
  });

  let customerId = org.subscription?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: params.customerEmail,
      name: org.name,
      metadata: { organizationId: org.id, slug: org.slug },
    });
    customerId = customer.id;
    await prisma.platformSubscription.update({
      where: { organizationId: org.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const priceId = await ensurePilotPriceId();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { organizationId: org.id },
    subscription_data: {
      metadata: { organizationId: org.id, plan: 'PILOT' },
    },
  });

  await writeAudit({
    organizationId: org.id,
    action: 'billing.checkout_created',
    resourceType: 'PlatformSubscription',
    metadata: { sessionId: session.id },
  });

  return { url: session.url };
}

export async function handleStripeWebhookEvent(event: {
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<void> {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const organizationId = session.metadata
      ? (session.metadata as { organizationId?: string }).organizationId
      : undefined;
    if (!organizationId) return;

    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : null;
    const customerId =
      typeof session.customer === 'string' ? session.customer : null;

    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'ACTIVE' },
    });
    await prisma.platformSubscription.update({
      where: { organizationId },
      data: {
        status: 'ACTIVE',
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await writeAudit({
      organizationId,
      action: 'billing.subscription_activated',
      resourceType: 'PlatformSubscription',
    });
  }

  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object;
    const organizationId = sub.metadata
      ? (sub.metadata as { organizationId?: string }).organizationId
      : undefined;
    if (!organizationId) return;

    const statusRaw = String(sub.status || '');
    const mapped =
      statusRaw === 'active'
        ? 'ACTIVE'
        : statusRaw === 'past_due'
          ? 'PAST_DUE'
          : statusRaw === 'canceled' || statusRaw === 'cancelled'
            ? 'CANCELLED'
            : statusRaw === 'unpaid'
              ? 'UNPAID'
              : statusRaw === 'trialing'
                ? 'TRIALING'
                : 'INCOMPLETE';

    await prisma.platformSubscription.update({
      where: { organizationId },
      data: {
        status: mapped,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      },
    });

    if (mapped === 'CANCELLED') {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { status: 'CANCELLED' },
      });
    }
  }
}

export async function createConnectExpressAccount(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });

  if (!isStripeConfigured()) {
    const fakeId = `acct_sim_${org.slug}`;
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        stripeConnectAccountId: fakeId,
        stripeConnectReady: false,
      },
    });
    return { accountId: fakeId, simulated: true, onboardingUrl: null as string | null };
  }

  const stripe = getStripe();
  let accountId = org.stripeConnectAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'CA',
      email: undefined,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { organizationId: org.id, slug: org.slug },
    });
    accountId = account.id;
    await prisma.organization.update({
      where: { id: organizationId },
      data: { stripeConnectAccountId: accountId },
    });
  }

  const frontend = process.env.FRONTEND_URL || 'http://localhost:3007';
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${frontend}/settings/billing?connect=refresh`,
    return_url: `${frontend}/settings/billing?connect=return`,
    type: 'account_onboarding',
  });

  await writeAudit({
    organizationId,
    action: 'connect.onboarding_link_created',
    resourceType: 'Organization',
    resourceId: organizationId,
  });

  return { accountId, simulated: false, onboardingUrl: link.url };
}

export async function refreshConnectStatus(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });
  if (!org.stripeConnectAccountId || !isStripeConfigured()) {
    return { ready: org.stripeConnectReady };
  }
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(org.stripeConnectAccountId);
  const ready = Boolean(account.charges_enabled && account.details_submitted);
  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeConnectReady: ready },
  });
  return { ready };
}
