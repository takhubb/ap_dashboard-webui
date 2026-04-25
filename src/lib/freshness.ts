import type {
  IndicatorFreshnessCycle,
  IndicatorFreshnessPolicy,
  IndicatorPoint,
} from "@/lib/estat/types";

export function getPeriodCycle(period: string): IndicatorFreshnessCycle | null {
  if (/^\d{4}-\d{2}$/.test(period)) {
    return "month";
  }

  if (/^\d{4}-Q[1-4]$/.test(period)) {
    return "quarter";
  }

  if (/^\d{4}$/.test(period)) {
    return "year";
  }

  return null;
}

export function getPeriodEndMonth(period: string) {
  const monthlyMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthlyMatch) {
    return Number(monthlyMatch[1]) * 12 + Number(monthlyMatch[2]);
  }

  const quarterlyMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarterlyMatch) {
    return Number(quarterlyMatch[1]) * 12 + Number(quarterlyMatch[2]) * 3;
  }

  const yearlyMatch = period.match(/^(\d{4})$/);
  if (yearlyMatch) {
    return Number(yearlyMatch[1]) * 12 + 12;
  }

  return null;
}

export function getCurrentMonthIndex(referenceDate = new Date()) {
  return referenceDate.getUTCFullYear() * 12 + referenceDate.getUTCMonth() + 1;
}

export function getLagMonths(period: string, referenceDate = new Date()) {
  const endMonth = getPeriodEndMonth(period);
  if (endMonth === null) {
    return null;
  }

  return getCurrentMonthIndex(referenceDate) - endMonth;
}

export function checkFreshness(
  lastPeriod: string,
  policy?: IndicatorFreshnessPolicy,
  referenceDate = new Date(),
) {
  const cycle = getPeriodCycle(lastPeriod);
  const lagMonths = getLagMonths(lastPeriod, referenceDate);

  if (!policy) {
    const maxLagMonths = cycle === "quarter" ? 8 : cycle === "year" ? 24 : 4;
    const isStale = lagMonths !== null && lagMonths > maxLagMonths;
    return {
      cycle,
      lagMonths,
      isStale,
      reason: isStale
        ? `最新期間 ${lastPeriod} は ${lagMonths}か月前で、許容遅延 ${maxLagMonths}か月を超えています。`
        : undefined,
    };
  }

  if (!cycle || !policy.allowedCycles.includes(cycle)) {
    return {
      cycle,
      lagMonths,
      isStale: true,
      reason: `周期 ${cycle ?? "不明"} は対象外です。`,
    };
  }

  const isStale = lagMonths !== null && lagMonths > policy.maxLagMonths;
  return {
    cycle,
    lagMonths,
    isStale,
    reason: isStale
      ? `最新期間 ${lastPeriod} は ${lagMonths}か月前で、許容遅延 ${policy.maxLagMonths}か月を超えています。`
      : undefined,
  };
}

export function latestNonNullPoint(points: IndicatorPoint[]) {
  return [...points].reverse().find((point) => point.value !== null) ?? null;
}

export function movingAverage(points: IndicatorPoint[], size: number) {
  const values = points
    .slice(Math.max(points.length - size, 0))
    .map((point) => point.value)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateYearOverYearAtLatest(points: IndicatorPoint[], averageWindow = 1) {
  if (points.length < averageWindow + 12) {
    return null;
  }

  const latestAverage = movingAverage(points, averageWindow);
  const referencePoints = points.slice(0, Math.max(points.length - 12, 0));
  const referenceAverage = movingAverage(referencePoints, averageWindow);

  if (
    latestAverage === null ||
    referenceAverage === null ||
    referenceAverage === 0
  ) {
    return null;
  }

  return ((latestAverage - referenceAverage) / Math.abs(referenceAverage)) * 100;
}
