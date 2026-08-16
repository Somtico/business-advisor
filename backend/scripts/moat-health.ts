/**
 * Internal: print moat health metrics (no PlatformAdmin UI).
 * Usage: npx ts-node scripts/moat-health.ts
 */
import { computeMoatHealthMetrics } from '../src/services/moat/moatHealthService';

async function main() {
  const metrics = await computeMoatHealthMetrics();
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
