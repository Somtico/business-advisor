import { EducationSubtype } from '@prisma/client';
import prisma from '../config/prisma';
import { parseOptionalCashBalanceCents } from '../lib/parseMoney';
import {
  CASH_SOURCE_ONBOARDING,
  recordCashBalanceObservation,
} from './metrics/cashObservationService';

const EDUCATION_SUBTYPES = new Set<string>(Object.values(EducationSubtype));

export class OnboardingError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'OnboardingError';
    this.code = code;
    this.status = status;
  }
}

export async function completeOnboarding(params: {
  organizationId: string;
  educationSubtype: unknown;
  educationSubtypeOther?: unknown;
  cashBalanceCents?: unknown;
}) {
  const subtype = String(params.educationSubtype || '');
  if (!EDUCATION_SUBTYPES.has(subtype)) {
    throw new OnboardingError(
      'EDUCATION_SUBTYPE_REQUIRED',
      'Please choose what type of education business you run.'
    );
  }

  let other: string | null = null;
  if (subtype === 'OTHER') {
    other = String(params.educationSubtypeOther || '').trim();
    if (!other) {
      throw new OnboardingError(
        'OTHER_SUBTYPE_REQUIRED',
        'Please describe your education subtype when selecting Other.'
      );
    }
  }

  let cashCents: number | undefined;
  try {
    cashCents = parseOptionalCashBalanceCents(params.cashBalanceCents);
  } catch {
    throw new OnboardingError(
      'INVALID_CASH_BALANCE',
      'Enter a whole-cent cash amount, or leave the field blank.'
    );
  }

  await prisma.organization.update({
    where: { id: params.organizationId },
    data: {
      onboardingCompleted: true,
      educationSubtype: subtype as EducationSubtype,
      educationSubtypeOther: subtype === 'OTHER' ? other : null,
    },
  });

  if (cashCents !== undefined) {
    await recordCashBalanceObservation({
      organizationId: params.organizationId,
      amountCents: cashCents,
      source: CASH_SOURCE_ONBOARDING,
    });
  }

  return prisma.organization.findUniqueOrThrow({
    where: { id: params.organizationId },
  });
}
