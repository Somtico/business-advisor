/**
 * Coarse bands for privacy-safe learning. Exact values stay tenant-private.
 */

export function activeEnrolmentBand(n: number): string {
  if (n <= 0) return '0';
  if (n <= 19) return '1-19';
  if (n <= 49) return '20-49';
  if (n <= 99) return '50-99';
  if (n <= 249) return '100-249';
  return '250+';
}

export function locationCountBand(n: number): string {
  if (n <= 0) return '0';
  if (n === 1) return '1';
  if (n <= 3) return '2-3';
  return '4+';
}

export function utilizationBand(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return 'unknown';
  if (rate < 0.4) return 'low';
  if (rate < 0.7) return 'moderate';
  if (rate < 0.9) return 'high';
  return 'near_full';
}

export function conversionHealth(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return 'unknown';
  if (rate < 0.15) return 'weak';
  if (rate < 0.35) return 'fair';
  return 'healthy';
}

export function retentionHealth(churnRate: number | null | undefined): string {
  if (churnRate == null || Number.isNaN(churnRate)) return 'unknown';
  if (churnRate > 0.15) return 'at_risk';
  if (churnRate > 0.08) return 'watch';
  return 'stable';
}

export function spareCapacityState(params: {
  utilization: number | null | undefined;
  spareSeats: number | null | undefined;
}): string {
  const { utilization, spareSeats } = params;
  if (spareSeats != null && spareSeats <= 0) return 'full';
  if (utilization != null && utilization >= 0.9) return 'tight';
  if (spareSeats != null && spareSeats > 0) return 'spare';
  return 'unknown';
}

export function cashSafetyBand(params: {
  runwayWeeks: number | null | undefined;
  cashBalanceCents: number | null | undefined;
}): string {
  const { runwayWeeks, cashBalanceCents } = params;
  if (runwayWeeks != null) {
    if (runwayWeeks < 4) return 'tight';
    if (runwayWeeks < 12) return 'moderate';
    return 'comfortable';
  }
  if (cashBalanceCents != null) {
    if (cashBalanceCents <= 0) return 'tight';
    if (cashBalanceCents < 500_000) return 'moderate';
    return 'comfortable';
  }
  return 'unknown';
}

export function seasonOrPeriod(asOf: Date = new Date()): string {
  const month = asOf.getMonth() + 1;
  if (month >= 9 && month <= 11) return 'fall_term';
  if (month === 12 || month <= 2) return 'winter_term';
  if (month >= 3 && month <= 5) return 'spring_term';
  return 'summer';
}

export function effortOrCostBand(
  costBand: 'FREE' | 'LOW' | 'PAID' | string | null | undefined
): string {
  if (!costBand) return 'unknown';
  return String(costBand).toLowerCase();
}
