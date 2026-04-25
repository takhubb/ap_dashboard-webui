import { REGIONAL_INDICATORS } from "@/config/indicators";
import {
  getData,
  getIndicatorInfo,
  getRegionInfo,
  parseDashboardPeriod,
  type DashboardDataRow,
  type DashboardIndicatorInfo,
} from "@/lib/dashboard/client";
import type {
  DataIssue,
  IndicatorConfig,
  IndicatorPoint,
  PrefectureInfo,
  RegionalDashboardSnapshot,
  RegionalDemandScore,
  RegionalHousingMix,
  RegionalLatestValue,
  RegionalMetricSeries,
  RegionalMomentum,
} from "@/lib/estat/types";
import {
  calculateYearOverYearAtLatest,
  checkFreshness,
  movingAverage,
} from "@/lib/freshness";

const NATIONAL_REGION = { code: "00000", name: "全国" };

type RegionalFetchResult = {
  snapshot: RegionalDashboardSnapshot;
  issues: DataIssue[];
};

class StaleRegionalMetricError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleRegionalMetricError";
  }
}

function sourceType(config: IndicatorConfig) {
  return config.sourceType ?? "dashboard";
}

function buildIssue(
  config: IndicatorConfig,
  reason: string,
  severity: DataIssue["severity"] = "error",
): DataIssue {
  return {
    id: config.id,
    title: config.title,
    sourceName: config.sourceName,
    sourceType: sourceType(config),
    reason,
    severity,
  };
}

function shouldReportIssue(config: IndicatorConfig, severity: DataIssue["severity"]) {
  if (config.showIssueInSummary === false) {
    return false;
  }

  if (severity === "stale" && config.staleBehavior !== "showWarning") {
    return false;
  }

  return true;
}

function dashboardTimeFrom(months: number, cycle?: string) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);

  if (cycle === "2") {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `${date.getUTCFullYear()}${quarter}Q00`;
  }

  if (cycle === "3") {
    return `${date.getUTCFullYear()}CY00`;
  }

  if (cycle === "4") {
    return `${date.getUTCFullYear()}FY00`;
  }

  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}00`;
}

function cycleRank(cycle?: string) {
  if (cycle === "1") {
    return 0;
  }

  if (cycle === "2") {
    return 1;
  }

  return 2;
}

function sortCandidates(candidates: DashboardIndicatorInfo[], config: IndicatorConfig) {
  return [...candidates].sort((left, right) => {
    const leftPreferred = config.preferredIndicatorCodes?.includes(left.code) ? 0 : 1;
    const rightPreferred = config.preferredIndicatorCodes?.includes(right.code) ? 0 : 1;
    if (leftPreferred !== rightPreferred) {
      return leftPreferred - rightPreferred;
    }

    const leftCycle = cycleRank(left.cycle);
    const rightCycle = cycleRank(right.cycle);
    if (leftCycle !== rightCycle) {
      return leftCycle - rightCycle;
    }

    const leftUnit = config.unit && left.unit === config.unit ? 0 : 1;
    const rightUnit = config.unit && right.unit === config.unit ? 0 : 1;
    if (leftUnit !== rightUnit) {
      return leftUnit - rightUnit;
    }

    return left.name.localeCompare(right.name, "ja");
  });
}

function uniqueCandidates(candidates: DashboardIndicatorInfo[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.code}:${candidate.cycle}:${candidate.regionalRank}:${candidate.isSeasonal}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function getCandidates(config: IndicatorConfig) {
  const preferredCodes = config.preferredIndicatorCodes ?? [];
  const preferred = preferredCodes.length > 0
    ? await getIndicatorInfo({
        indicatorCode: preferredCodes,
        regionalRank: "3",
        isSeasonalAdjustment: config.dashboard?.isSeasonalAdjustment,
      })
    : [];
  const searched = await getIndicatorInfo({
    searchIndicatorWord: config.searchKeyword ?? config.statSearchKeyword ?? config.title,
    regionalRank: "3",
    isSeasonalAdjustment: config.dashboard?.isSeasonalAdjustment,
  });

  return sortCandidates(uniqueCandidates([...preferred, ...searched]), config);
}

function rowsToPointsByRegion(rows: DashboardDataRow[]) {
  const maps: Record<string, Map<string, IndicatorPoint>> = {};

  rows.forEach((row) => {
    const period = parseDashboardPeriod(row.timeCode);
    if (!period || !row.regionCode) {
      return;
    }

    maps[row.regionCode] ??= new Map<string, IndicatorPoint>();
    maps[row.regionCode].set(period.period, {
      period: period.period,
      sortKey: period.sortKey,
      value: row.value,
    });
  });

  return Object.fromEntries(
    Object.entries(maps).map(([regionCode, pointMap]) => [
      regionCode,
      [...pointMap.values()].sort((left, right) => left.sortKey - right.sortKey),
    ]),
  );
}

function getReferencePoint(points: IndicatorPoint[], latestPoint: IndicatorPoint) {
  const offset = latestPoint.period.includes("-Q")
    ? 4
    : latestPoint.period.includes("-")
      ? 12
      : 1;

  return points.find((point) => point.sortKey === latestPoint.sortKey - offset) ?? null;
}

function calculateChange(latestValue: number | null, previousValue: number | null) {
  if (
    latestValue === null ||
    previousValue === null ||
    !Number.isFinite(latestValue) ||
    !Number.isFinite(previousValue) ||
    previousValue === 0
  ) {
    return null;
  }

  return ((latestValue - previousValue) / Math.abs(previousValue)) * 100;
}

function latestValueForRegion(
  regionCode: string,
  regionName: string,
  points: IndicatorPoint[] = [],
): RegionalLatestValue | null {
  const latestPoint = [...points].reverse().find((point) => point.value !== null);
  if (!latestPoint) {
    return null;
  }

  const referencePoint = getReferencePoint(points, latestPoint);

  return {
    regionCode,
    regionName,
    latestValue: latestPoint.value,
    previousValue: referencePoint?.value ?? null,
    changeRate: calculateChange(latestPoint.value, referencePoint?.value ?? null),
    threeMonthAverage: movingAverage(points, 3),
    twelveMonthAverage: movingAverage(points, 12),
    lastPeriod: latestPoint.period,
  };
}

function latestPeriod(pointsByRegion: Record<string, IndicatorPoint[]>) {
  return Object.values(pointsByRegion)
    .flat()
    .filter((point) => point.value !== null)
    .sort((left, right) => right.sortKey - left.sortKey)[0]?.period;
}

async function fetchRegionalMetric(
  config: IndicatorConfig,
  prefectures: PrefectureInfo[],
) {
  const regionCodes = [NATIONAL_REGION.code, ...prefectures.map((prefecture) => prefecture.code)];
  const candidates = await getCandidates(config);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const data = await getData({
        indicatorCode: candidate.code,
        regionCode: regionCodes,
        cycle: candidate.cycle ?? config.dashboard?.cycle,
        isSeasonalAdjustment:
          candidate.isSeasonal ?? config.dashboard?.isSeasonalAdjustment ?? "1",
        timeFrom: dashboardTimeFrom(
          config.dashboard?.timeFromMonths ?? 84,
          candidate.cycle ?? config.dashboard?.cycle,
        ),
      });
      const pointsByRegion = rowsToPointsByRegion(data.rows);
      const period = latestPeriod(pointsByRegion);

      if (!period) {
        errors.push(`${candidate.name}: 有効な時系列データがありません。`);
        continue;
      }

      const freshness = checkFreshness(period, config.freshnessPolicy);
      if (freshness.isStale) {
        errors.push(`${candidate.name}: ${freshness.reason}`);
        continue;
      }

      const latestByRegion: Record<string, RegionalLatestValue> = {};
      [NATIONAL_REGION, ...prefectures].forEach((region) => {
        const latest = latestValueForRegion(region.code, region.name, pointsByRegion[region.code]);
        if (latest) {
          latestByRegion[region.code] = latest;
        }
      });

      const missingPrefectures = prefectures.filter(
        (prefecture) => !latestByRegion[prefecture.code],
      );

      const metric: RegionalMetricSeries = {
        indicatorId: config.id,
        title: config.title,
        sourceName: candidate.statName
          ? `${candidate.statName}（統計ダッシュボードAPI）`
          : config.sourceName,
        sourceType: "dashboard",
        unit: candidate.unit || config.unit,
        changeLabel: period.includes("-Q") ? "前年同期比" : "前年同月比",
        changeSuffix: "%",
        status: "ok",
        lastPeriod: period,
        lastUpdatedAt: data.fetchedAt,
        notes: config.notes,
        pointsByRegion,
        latestByRegion,
      };

      return {
        metric,
        warnings: missingPrefectures.length > 0
          ? [
              `${missingPrefectures.length}県で最新値を取得できませんでした。`,
            ]
          : [],
      };
    } catch (error) {
      errors.push(
        `${candidate.name || candidate.code}: ${
          error instanceof Error ? error.message : "取得に失敗しました。"
        }`,
      );
    }
  }

  if (errors.some((error) => error.includes("周期 year は対象外"))) {
    throw new StaleRegionalMetricError(errors.join(" / "));
  }

  throw new Error(
    errors.length > 0
      ? errors.join(" / ")
      : "統計ダッシュボード API で都道府県別の候補系列を見つけられませんでした。",
  );
}

function metricMap(metrics: RegionalMetricSeries[]) {
  return new Map(metrics.map((metric) => [metric.indicatorId, metric]));
}

function zScores(values: Array<{ regionCode: string; value: number }>) {
  const mean = values.reduce((sum, item) => sum + item.value, 0) / values.length;
  const variance =
    values.reduce((sum, item) => sum + (item.value - mean) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance) || 1;

  return new Map(
    values.map((item) => [item.regionCode, (item.value - mean) / standardDeviation]),
  );
}

function scaleScore(value: number, min: number, max: number) {
  if (max === min) {
    return 50;
  }

  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function buildDemandScores(
  metrics: RegionalMetricSeries[],
  prefectures: PrefectureInfo[],
) {
  const configs = REGIONAL_INDICATORS.find(
    (config) => config.id === "regional-housing-demand-score",
  );
  const metricById = metricMap(metrics);
  const inputIds = configs?.derivedFrom ?? [];
  const availableInputs = inputIds
    .map((id) => metricById.get(id))
    .filter((metric): metric is RegionalMetricSeries => Boolean(metric));
  const missingInputs = inputIds.filter((id) => !metricById.has(id));

  if (availableInputs.length === 0) {
    return {
      scores: [],
      warning: "地域住宅需要スコアの入力データを取得できませんでした。",
    };
  }

  const zByMetric = new Map<string, Map<string, number>>();
  availableInputs.forEach((metric) => {
    const values = prefectures
      .map((prefecture) => ({
        regionCode: prefecture.code,
        value: metric.latestByRegion[prefecture.code]?.changeRate,
      }))
      .filter((item): item is { regionCode: string; value: number } =>
        item.value !== null && item.value !== undefined && Number.isFinite(item.value),
      );

    if (values.length > 0) {
      zByMetric.set(metric.indicatorId, zScores(values));
    }
  });

  const rawScores = prefectures.flatMap((prefecture) => {
    const values = availableInputs
      .map((metric) => zByMetric.get(metric.indicatorId)?.get(prefecture.code))
      .filter((value): value is number => value !== undefined && Number.isFinite(value));

    if (values.length === 0) {
      return [];
    }

    return [{
      regionCode: prefecture.code,
      regionName: prefecture.name,
      raw: values.reduce((sum, value) => sum + value, 0) / values.length,
      inputCount: values.length,
    }];
  });

  if (rawScores.length === 0) {
    return {
      scores: [],
      warning: "地域住宅需要スコアを計算できる都道府県データがありません。",
    };
  }

  const min = Math.min(...rawScores.map((item) => item.raw));
  const max = Math.max(...rawScores.map((item) => item.raw));
  const nationalRawValues = availableInputs
    .map((metric) => {
      const nationalChange = metric.latestByRegion[NATIONAL_REGION.code]?.changeRate;
      const prefectureValues = prefectures
        .map((prefecture) => metric.latestByRegion[prefecture.code]?.changeRate)
        .filter((value): value is number =>
          value !== null && value !== undefined && Number.isFinite(value),
        );

      if (nationalChange === null || nationalChange === undefined || prefectureValues.length === 0) {
        return null;
      }

      const mean = prefectureValues.reduce((sum, value) => sum + value, 0) / prefectureValues.length;
      const variance =
        prefectureValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        prefectureValues.length;
      const standardDeviation = Math.sqrt(variance) || 1;
      return (nationalChange - mean) / standardDeviation;
    })
    .filter((value): value is number => value !== null);
  const nationalRaw = nationalRawValues.length > 0
    ? nationalRawValues.reduce((sum, value) => sum + value, 0) / nationalRawValues.length
    : 0;
  const nationalScore = scaleScore(nationalRaw, min, max);

  const scores: RegionalDemandScore[] = rawScores.map((item) => {
    const score = scaleScore(item.raw, min, max);
    return {
      regionCode: item.regionCode,
      regionName: item.regionName,
      score,
      nationalDifference: score - nationalScore,
      inputCount: item.inputCount,
      missingInputs,
    };
  });

  return {
    scores,
    warning: missingInputs.length > 0
      ? `地域住宅需要スコアは ${missingInputs.length} 系列を除いて算出しました。`
      : undefined,
  };
}

function ratio(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator === 0
  ) {
    return null;
  }

  return (numerator / denominator) * 100;
}

function buildHousingMix(metrics: RegionalMetricSeries[], prefectures: PrefectureInfo[]) {
  const byId = metricMap(metrics);
  const total = byId.get("pref-housing-starts-total");
  const owner = byId.get("pref-housing-starts-owner");
  const rental = byId.get("pref-housing-starts-rental");
  const forSale = byId.get("pref-housing-starts-for-sale");

  if (!total || !owner || !rental || !forSale) {
    return [];
  }

  const nationalOwner = ratio(
    owner.latestByRegion[NATIONAL_REGION.code]?.latestValue,
    total.latestByRegion[NATIONAL_REGION.code]?.latestValue,
  );
  const nationalRental = ratio(
    rental.latestByRegion[NATIONAL_REGION.code]?.latestValue,
    total.latestByRegion[NATIONAL_REGION.code]?.latestValue,
  );
  const nationalForSale = ratio(
    forSale.latestByRegion[NATIONAL_REGION.code]?.latestValue,
    total.latestByRegion[NATIONAL_REGION.code]?.latestValue,
  );

  return prefectures.map<RegionalHousingMix>((prefecture) => {
    const denominator = total.latestByRegion[prefecture.code]?.latestValue;
    const ownerRatio = ratio(owner.latestByRegion[prefecture.code]?.latestValue, denominator);
    const rentalRatio = ratio(rental.latestByRegion[prefecture.code]?.latestValue, denominator);
    const forSaleRatio = ratio(forSale.latestByRegion[prefecture.code]?.latestValue, denominator);
    const ratios = [
      { type: "owner", value: ownerRatio },
      { type: "rental", value: rentalRatio },
      { type: "forSale", value: forSaleRatio },
    ].filter((item): item is { type: string; value: number } => item.value !== null);
    const dominant = ratios.sort((left, right) => right.value - left.value)[0]?.type;
    const comment =
      dominant === "owner"
        ? "持家比率が高く、戸建向け建材寄りです。"
        : dominant === "rental"
          ? "貸家比率が高く、集合住宅・内装・設備寄りです。"
          : dominant === "forSale"
            ? "分譲比率が高く、デベロッパー案件・集合住宅寄りです。"
            : "構成比を判定できるデータが不足しています。";

    return {
      regionCode: prefecture.code,
      regionName: prefecture.name,
      ownerRatio,
      rentalRatio,
      forSaleRatio,
      ownerDifferenceFromNational:
        ownerRatio !== null && nationalOwner !== null ? ownerRatio - nationalOwner : null,
      rentalDifferenceFromNational:
        rentalRatio !== null && nationalRental !== null ? rentalRatio - nationalRental : null,
      forSaleDifferenceFromNational:
        forSaleRatio !== null && nationalForSale !== null ? forSaleRatio - nationalForSale : null,
      comment,
      lastPeriod: total.latestByRegion[prefecture.code]?.lastPeriod ?? total.lastPeriod,
    };
  });
}

function buildCostProxy(metrics: RegionalMetricSeries[], prefectures: PrefectureInfo[]) {
  const byId = metricMap(metrics);
  const cost = byId.get("pref-planned-construction-cost");
  const floor = byId.get("pref-housing-floor-area");

  if (!cost || !floor) {
    return undefined;
  }

  const allRegions = [NATIONAL_REGION, ...prefectures];
  const pointsByRegion = Object.fromEntries(
    allRegions.map((region) => {
      const costPoints = cost.pointsByRegion[region.code] ?? [];
      const floorMap = new Map(
        (floor.pointsByRegion[region.code] ?? []).map((point) => [point.period, point]),
      );
      const points = costPoints.flatMap((costPoint) => {
        const floorPoint = floorMap.get(costPoint.period);
        if (
          costPoint.value === null ||
          floorPoint?.value === null ||
          floorPoint?.value === undefined ||
          floorPoint.value === 0
        ) {
          return [];
        }

        return [{
          period: costPoint.period,
          sortKey: costPoint.sortKey,
          value: costPoint.value / floorPoint.value,
        }];
      });

      return [region.code, points];
    }),
  );
  const period = latestPeriod(pointsByRegion);

  if (!period) {
    return undefined;
  }

  const latestByRegion = Object.fromEntries(
    allRegions.flatMap((region) => {
      const latest = latestValueForRegion(region.code, region.name, pointsByRegion[region.code]);
      return latest ? [[region.code, latest]] : [];
    }),
  );

  return {
    indicatorId: "pref-construction-unit-cost-proxy",
    title: "工事単価 proxy",
    sourceName: "独自算出（工事費予定額 / 着工床面積）",
    sourceType: "computed" as const,
    unit: "万円/㎡",
    changeLabel: "前年同月比",
    changeSuffix: "%" as const,
    status: "ok" as const,
    lastPeriod: period,
    notes: "実際の契約単価ではなく、予定工事費ベースの proxy です。",
    pointsByRegion,
    latestByRegion,
  };
}

function buildMomentum(metrics: RegionalMetricSeries[], prefectures: PrefectureInfo[]) {
  const starts = metricMap(metrics).get("pref-housing-starts-total");
  if (!starts) {
    return [];
  }

  const nationalPoints = starts.pointsByRegion[NATIONAL_REGION.code] ?? [];
  const nationalShortMomentum = calculateYearOverYearAtLatest(nationalPoints, 3);
  const nationalMediumTrend = calculateYearOverYearAtLatest(nationalPoints, 12);

  return prefectures.map<RegionalMomentum>((prefecture) => {
    const points = starts.pointsByRegion[prefecture.code] ?? [];
    const shortMomentum = calculateYearOverYearAtLatest(points, 3);
    const mediumTrend = calculateYearOverYearAtLatest(points, 12);
    const label =
      shortMomentum === null || mediumTrend === null
        ? "判定不可"
        : shortMomentum > mediumTrend + 1
          ? "改善"
          : shortMomentum < mediumTrend - 1
            ? "悪化"
            : "横ばい";

    return {
      regionCode: prefecture.code,
      regionName: prefecture.name,
      shortMomentum,
      mediumTrend,
      nationalShortMomentum,
      nationalMediumTrend,
      label,
    };
  });
}

export async function fetchRegionalDashboard(forceRefresh = false): Promise<RegionalFetchResult> {
  void forceRefresh;
  const issues: DataIssue[] = [];
  const prefectures = await getRegionInfo({
    parentRegionCode: NATIONAL_REGION.code,
    regionLevel: "3",
  });
  const metricConfigs = REGIONAL_INDICATORS.filter(
    (config) => config.sourceType === "dashboard",
  );
  const metricResults = await Promise.all(
    metricConfigs.map(async (config) => {
      try {
        const result = await fetchRegionalMetric(config, prefectures);
        if (shouldReportIssue(config, "warning")) {
          result.warnings.forEach((warning) => issues.push(buildIssue(config, warning, "warning")));
        }
        return result.metric;
      } catch (error) {
        const severity = error instanceof StaleRegionalMetricError ? "stale" : "error";
        if (shouldReportIssue(config, severity)) {
          issues.push(
            buildIssue(
              config,
              error instanceof Error ? error.message : "地域別データの取得に失敗しました。",
              severity,
            ),
          );
        }
        return null;
      }
    }),
  );
  const metrics = metricResults.filter(
    (metric): metric is RegionalMetricSeries => Boolean(metric),
  );
  const demand = buildDemandScores(metrics, prefectures);
  if (demand.warning) {
    const config = REGIONAL_INDICATORS.find(
      (indicator) => indicator.id === "regional-housing-demand-score",
    );
    if (config && shouldReportIssue(config, "warning")) {
      issues.push(buildIssue(config, demand.warning, "warning"));
    }
  }

  return {
    snapshot: {
      prefectures,
      defaultRegionCode: prefectures.find((prefecture) => prefecture.code === "13000")?.code
        ?? prefectures[0]?.code
        ?? "",
      metrics,
      demandScores: demand.scores,
      housingMix: buildHousingMix(metrics, prefectures),
      costProxy: buildCostProxy(metrics, prefectures),
      momentum: buildMomentum(metrics, prefectures),
    },
    issues,
  };
}
