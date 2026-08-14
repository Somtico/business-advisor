import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

export async function writeAudit(params: {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      organizationId: params.organizationId ?? null,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata ?? undefined,
    },
  });
}
