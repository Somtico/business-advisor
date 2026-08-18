jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    recommendation: { findMany: jest.fn().mockResolvedValue([]) },
    enrolmentTacticTried: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('./impactService', () => ({
  impactSummary: jest.fn().mockResolvedValue({
    verified: { totalCents: 0 },
    awaitingConfirmationCount: 0,
    pipelineCount: 0,
  }),
}));

jest.mock('./enrolmentService', () => ({
  enrolmentGuidance: jest.fn().mockResolvedValue({ leak: 'ON_TRACK' }),
  TACTIC_CATALOG: [],
}));

import prisma from '../config/prisma';
import { organizationMemory } from './organizationMemoryService';

describe('Advisor organization isolation', () => {
  it('loads organization memory only for the membership organization', async () => {
    await organizationMemory('org-a');
    expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      })
    );
    expect(prisma.enrolmentTacticTried.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      })
    );
    const recWhere = (prisma.recommendation.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(recWhere.organizationId).not.toBe('org-b');
  });
});
