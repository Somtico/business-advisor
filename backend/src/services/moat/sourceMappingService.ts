import { MappingReviewStatus } from '@prisma/client';
import prisma from '../../config/prisma';
import { schemaFingerprint } from './schemaFingerprint';

/** Confidence below this requires human confirmation before applying a mapping. */
export const MAPPING_AUTO_APPLY_MIN_CONFIDENCE = 0.85;

export type MappingFieldProbe = {
  name: string;
  dataType?: string | null;
};

export type MappingSuggestion = {
  sourceFieldName: string;
  proposedCanonical: string;
  confidence: number;
  reviewStatus: MappingReviewStatus;
  requiresConfirmation: boolean;
  knowledgeId: string | null;
  transformationRule: string | null;
};

/**
 * Propose canonical mappings from reviewed knowledge.
 * Never stores raw source row values — only field metadata.
 */
export async function proposeMappings(params: {
  sourceSystemType: string;
  fields: MappingFieldProbe[];
}): Promise<{
  schemaFingerprint: string;
  suggestions: MappingSuggestion[];
}> {
  const fingerprint = schemaFingerprint(params.fields);
  const knowledge = await prisma.sourceMappingKnowledge.findMany({
    where: {
      sourceSystemType: params.sourceSystemType,
      schemaFingerprint: fingerprint,
      reviewStatus: { in: ['APPROVED', 'PROPOSED'] },
    },
    orderBy: [{ confidence: 'desc' }, { successfulUses: 'desc' }],
  });

  const byField = new Map<string, (typeof knowledge)[0]>();
  for (const row of knowledge) {
    const key = row.sourceFieldName.toLowerCase();
    if (!byField.has(key)) byField.set(key, row);
  }

  const suggestions: MappingSuggestion[] = params.fields.map((f) => {
    const hit = byField.get(f.name.trim().toLowerCase());
    if (!hit) {
      return {
        sourceFieldName: f.name,
        proposedCanonical: '',
        confidence: 0,
        reviewStatus: 'PROPOSED' as MappingReviewStatus,
        requiresConfirmation: true,
        knowledgeId: null,
        transformationRule: null,
      };
    }
    return {
      sourceFieldName: f.name,
      proposedCanonical: hit.proposedCanonical,
      confidence: hit.confidence,
      reviewStatus: hit.reviewStatus,
      requiresConfirmation:
        hit.reviewStatus !== 'APPROVED' ||
        hit.confidence < MAPPING_AUTO_APPLY_MIN_CONFIDENCE,
      knowledgeId: hit.id,
      transformationRule: hit.transformationRule,
    };
  });

  return { schemaFingerprint: fingerprint, suggestions };
}

export async function upsertMappingKnowledge(params: {
  sourceSystemType: string;
  fields: MappingFieldProbe[];
  sourceFieldName: string;
  sourceDataType?: string | null;
  proposedCanonical: string;
  transformationRule?: string | null;
  confidence: number;
  reviewStatus?: MappingReviewStatus;
  syntheticExample?: string | null;
}) {
  const fingerprint = schemaFingerprint(params.fields);
  const existing = await prisma.sourceMappingKnowledge.findFirst({
    where: {
      sourceSystemType: params.sourceSystemType,
      schemaFingerprint: fingerprint,
      sourceFieldName: params.sourceFieldName,
      proposedCanonical: params.proposedCanonical,
    },
    orderBy: { version: 'desc' },
  });

  if (existing) {
    return prisma.sourceMappingKnowledge.update({
      where: { id: existing.id },
      data: {
        confidence: params.confidence,
        reviewStatus: params.reviewStatus ?? existing.reviewStatus,
        transformationRule:
          params.transformationRule ?? existing.transformationRule,
        sourceDataType: params.sourceDataType ?? existing.sourceDataType,
        syntheticExample: params.syntheticExample ?? existing.syntheticExample,
      },
    });
  }

  return prisma.sourceMappingKnowledge.create({
    data: {
      sourceSystemType: params.sourceSystemType,
      schemaFingerprint: fingerprint,
      sourceFieldName: params.sourceFieldName,
      sourceDataType: params.sourceDataType ?? null,
      proposedCanonical: params.proposedCanonical,
      transformationRule: params.transformationRule ?? null,
      confidence: params.confidence,
      reviewStatus: params.reviewStatus ?? 'PROPOSED',
      syntheticExample: params.syntheticExample ?? null,
      version: 1,
    },
  });
}

export async function recordMappingUse(params: {
  knowledgeId: string;
  corrected: boolean;
}) {
  return prisma.sourceMappingKnowledge.update({
    where: { id: params.knowledgeId },
    data: params.corrected
      ? { correctionCount: { increment: 1 } }
      : { successfulUses: { increment: 1 } },
  });
}

/** Built-in CSV student header aliases used to seed knowledge (synthetic examples only). */
export const CSV_STUDENT_FIELD_PROBES: MappingFieldProbe[] = [
  { name: 'first_name', dataType: 'string' },
  { name: 'last_name', dataType: 'string' },
  { name: 'email', dataType: 'string' },
  { name: 'start_date', dataType: 'date' },
];

export async function seedCsvStudentMappingKnowledge() {
  const fields = CSV_STUDENT_FIELD_PROBES;
  const pairs: Array<[string, string, number]> = [
    ['first_name', 'Person.firstName', 0.95],
    ['last_name', 'Person.lastName', 0.95],
    ['email', 'Person.email', 0.9],
    ['start_date', 'Engagement.startDate', 0.88],
  ];
  for (const [source, canonical, confidence] of pairs) {
    await upsertMappingKnowledge({
      sourceSystemType: 'csv_students',
      fields,
      sourceFieldName: source,
      sourceDataType: 'string',
      proposedCanonical: canonical,
      confidence,
      reviewStatus: 'APPROVED',
      syntheticExample: `synthetic:${source}->${canonical}`,
    });
  }
}
