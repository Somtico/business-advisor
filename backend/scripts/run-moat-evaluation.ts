/**
 * Internal: run Chuk-vs-generic synthetic evaluation harness.
 * Usage: npx ts-node scripts/run-moat-evaluation.ts
 */
import { runSyntheticEvaluation } from '../src/services/moat/evaluationHarness';
import prisma from '../src/config/prisma';

async function main() {
  const result = runSyntheticEvaluation();
  console.log(JSON.stringify(result, null, 2));

  for (const fixtureId of ['staffing_excess_hours', 'pricing_insufficient_data', 'enrolment_conversion_leak']) {
    await prisma.moatEvaluationRun.create({
      data: {
        fixtureId,
        provider: result.provider,
        model: result.model,
        mode: 'somtico_vs_generic',
        scoresJson: {
          somtico: result.somtico,
          generic: result.generic,
        },
        passed: result.somticoBeatsGeneric,
      },
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
