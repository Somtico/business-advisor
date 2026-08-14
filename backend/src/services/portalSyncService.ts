import prisma from '../config/prisma';
import { writeAudit } from './auditService';

export interface PortalChild {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  grade?: string | null;
  status?: string | null;
}

export interface PortalEnrollment {
  id: string;
  childId: string;
  classId?: string | null;
  membershipId?: string | null;
  status?: string | null;
  isFreeTrial?: boolean;
  isPaidTrial?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

export interface PortalProgramme {
  id: string;
  name: string;
  kind: 'class' | 'membership';
  priceCents?: number | null;
  capacity?: number | null;
}

export interface PortalTimeSlot {
  id: string;
  label?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  dayOfWeek?: number | null;
  capacity?: number | null;
}

export interface PortalStaff {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  role?: string | null;
}

export interface PortalConnectorPayload {
  children: PortalChild[];
  enrolments: PortalEnrollment[];
  programmes: PortalProgramme[];
  timeSlots?: PortalTimeSlot[];
  staff?: PortalStaff[];
  fetchedAt?: string;
}

async function upsertExternal(
  organizationId: string,
  entityType: string,
  entityId: string,
  sourceSystem: string,
  externalId: string
) {
  await prisma.externalIdentity.upsert({
    where: {
      organizationId_sourceSystem_entityType_externalId: {
        organizationId,
        sourceSystem,
        entityType,
        externalId,
      },
    },
    create: {
      organizationId,
      entityType,
      entityId,
      sourceSystem,
      externalId,
      lastSeenAt: new Date(),
    },
    update: {
      entityId,
      lastSeenAt: new Date(),
    },
  });
}

async function findByExternal(
  organizationId: string,
  sourceSystem: string,
  entityType: string,
  externalId: string
): Promise<string | null> {
  const row = await prisma.externalIdentity.findUnique({
    where: {
      organizationId_sourceSystem_entityType_externalId: {
        organizationId,
        sourceSystem,
        entityType,
        externalId,
      },
    },
  });
  return row?.entityId ?? null;
}

export async function syncPortalPayload(params: {
  organizationId: string;
  dataSourceId: string;
  payload: PortalConnectorPayload;
  sourceSystem?: string;
}) {
  const sourceSystem = params.sourceSystem || 'stem_lantern_portal';
  let upserted = 0;

  const run = await prisma.syncRun.create({
    data: {
      organizationId: params.organizationId,
      dataSourceId: params.dataSourceId,
      status: 'RUNNING',
    },
  });

  try {
    const programmeMap = new Map<string, string>();
    for (const p of params.payload.programmes) {
      let id = await findByExternal(
        params.organizationId,
        sourceSystem,
        'ProductService',
        `${p.kind}:${p.id}`
      );
      if (id) {
        await prisma.productService.update({
          where: { id },
          data: {
            name: p.name,
            priceCents: p.priceCents ?? undefined,
            capacity: p.capacity ?? undefined,
            category: p.kind,
            isActive: true,
          },
        });
      } else {
        const created = await prisma.productService.create({
          data: {
            organizationId: params.organizationId,
            name: p.name,
            code: p.id,
            category: p.kind,
            priceCents: p.priceCents ?? undefined,
            capacity: p.capacity ?? undefined,
          },
        });
        id = created.id;
        await upsertExternal(
          params.organizationId,
          'ProductService',
          id,
          sourceSystem,
          `${p.kind}:${p.id}`
        );
      }
      programmeMap.set(`${p.kind}:${p.id}`, id);
      upserted += 1;
    }

    for (const c of params.payload.children) {
      let id = await findByExternal(
        params.organizationId,
        sourceSystem,
        'Person',
        c.id
      );
      if (id) {
        await prisma.person.update({
          where: { id },
          data: {
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email ?? undefined,
            gradeOrAge: c.grade ?? undefined,
            status: c.status || 'active',
          },
        });
      } else {
        const created = await prisma.person.create({
          data: {
            organizationId: params.organizationId,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email ?? undefined,
            gradeOrAge: c.grade ?? undefined,
            status: c.status || 'active',
          },
        });
        id = created.id;
        await upsertExternal(
          params.organizationId,
          'Person',
          id,
          sourceSystem,
          c.id
        );
      }
      upserted += 1;
    }

    for (const e of params.payload.enrolments) {
      const personId = await findByExternal(
        params.organizationId,
        sourceSystem,
        'Person',
        e.childId
      );
      if (!personId) continue;

      let productServiceId: string | undefined;
      if (e.classId) {
        productServiceId = programmeMap.get(`class:${e.classId}`);
      } else if (e.membershipId) {
        productServiceId = programmeMap.get(`membership:${e.membershipId}`);
      }

      const isTrial = Boolean(e.isFreeTrial || e.isPaidTrial);
      const statusRaw = (e.status || '').toLowerCase();
      const status =
        statusRaw === 'canceled' || statusRaw === 'cancelled'
          ? 'CANCELLED'
          : statusRaw === 'ended' || statusRaw === 'expired' || statusRaw === 'completed'
            ? 'COMPLETED'
            : statusRaw === 'paused' || statusRaw === 'suspended'
              ? 'PAUSED'
              : isTrial
                ? 'TRIAL'
                : 'ACTIVE';

      let id = await findByExternal(
        params.organizationId,
        sourceSystem,
        'Engagement',
        e.id
      );
      if (id) {
        await prisma.engagement.update({
          where: { id },
          data: {
            personId,
            productServiceId,
            status,
            isTrial,
            startDate: e.startDate ? new Date(e.startDate) : undefined,
            endDate: e.endDate ? new Date(e.endDate) : undefined,
          },
        });
      } else {
        const created = await prisma.engagement.create({
          data: {
            organizationId: params.organizationId,
            personId,
            productServiceId,
            status,
            isTrial,
            startDate: e.startDate ? new Date(e.startDate) : undefined,
            endDate: e.endDate ? new Date(e.endDate) : undefined,
          },
        });
        id = created.id;
        await upsertExternal(
          params.organizationId,
          'Engagement',
          id,
          sourceSystem,
          e.id
        );
      }
      upserted += 1;
    }

    for (const slot of params.payload.timeSlots || []) {
      let capacityId = await findByExternal(
        params.organizationId,
        sourceSystem,
        'CapacityUnit',
        slot.id
      );
      if (capacityId) {
        await prisma.capacityUnit.update({
          where: { id: capacityId },
          data: {
            name: slot.label || `Slot ${slot.id}`,
            capacity: slot.capacity ?? 1,
          },
        });
      } else {
        const created = await prisma.capacityUnit.create({
          data: {
            organizationId: params.organizationId,
            name: slot.label || `Slot ${slot.id}`,
            unitType: 'seat',
            capacity: slot.capacity ?? 1,
          },
        });
        capacityId = created.id;
        await upsertExternal(
          params.organizationId,
          'CapacityUnit',
          capacityId,
          sourceSystem,
          slot.id
        );
      }
      upserted += 1;
    }

    for (const s of params.payload.staff || []) {
      let id = await findByExternal(
        params.organizationId,
        sourceSystem,
        'StaffMember',
        s.id
      );
      if (id) {
        await prisma.staffMember.update({
          where: { id },
          data: {
            firstName: s.firstName,
            lastName: s.lastName,
            email: s.email ?? undefined,
            roleTitle: s.role ?? undefined,
          },
        });
      } else {
        const created = await prisma.staffMember.create({
          data: {
            organizationId: params.organizationId,
            firstName: s.firstName,
            lastName: s.lastName,
            email: s.email ?? undefined,
            roleTitle: s.role ?? undefined,
          },
        });
        id = created.id;
        await upsertExternal(
          params.organizationId,
          'StaffMember',
          id,
          sourceSystem,
          s.id
        );
      }
      upserted += 1;
    }

    await prisma.dataSource.update({
      where: { id: params.dataSourceId },
      data: {
        status: 'CONNECTED',
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    await prisma.dataReadinessItem.updateMany({
      where: {
        organizationId: params.organizationId,
        datasetKey: { in: ['students', 'enrolments', 'programmes', 'sessions_capacity', 'staffing'] },
      },
      data: { status: 'CONNECTED' },
    });

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        finishedAt: new Date(),
        recordsUpserted: upserted,
      },
    });

    await writeAudit({
      organizationId: params.organizationId,
      action: 'connector.sync_succeeded',
      resourceType: 'DataSource',
      resourceId: params.dataSourceId,
      metadata: { upserted, sourceSystem },
    });

    return { syncRunId: run.id, recordsUpserted: upserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorMessage: message,
      },
    });
    await prisma.dataSource.update({
      where: { id: params.dataSourceId },
      data: { lastError: message, status: 'STALE' },
    });
    throw err;
  }
}

export async function fetchAndSyncPortal(organizationId: string) {
  const baseUrl = process.env.STEM_LANTERN_PORTAL_URL;
  const apiKey = process.env.STEM_LANTERN_PORTAL_API_KEY;
  if (!baseUrl || !apiKey) {
    throw Object.assign(
      new Error(
        'STEM_LANTERN_PORTAL_URL and STEM_LANTERN_PORTAL_API_KEY must be set'
      ),
      { status: 400, code: 'CONNECTOR_NOT_CONFIGURED' }
    );
  }

  let dataSource = await prisma.dataSource.findFirst({
    where: { organizationId, connectorKey: 'stem_lantern_portal' },
  });
  if (!dataSource) {
    dataSource = await prisma.dataSource.create({
      data: {
        organizationId,
        kind: 'API_CONNECTOR',
        name: 'STEM Lantern Registration Portal',
        connectorKey: 'stem_lantern_portal',
        status: 'MISSING',
      },
    });
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/connector/v1/snapshot`, {
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Portal connector failed (${res.status}): ${text}`);
  }
  const payload = (await res.json()) as PortalConnectorPayload;
  return syncPortalPayload({
    organizationId,
    dataSourceId: dataSource.id,
    payload,
  });
}
