import {
  getData,
  getIndicatorInfo,
  parseDashboardPeriod,
  type DashboardIndicatorInfo,
} from "@/lib/dashboard/client";
import { buildIndicatorSeriesFromPoints } from "@/lib/estat/normalize";
import type {
  IndicatorConfig,
  IndicatorPoint,
  IndicatorSeries,
} from "@/lib/estat/types";
import { checkFreshness } from "@/lib/freshness";

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
  const expectedUnit = config.unit;

  return [...candidates].sort((left, right) => {
    const leftCycle = cycleRank(left.cycle);
    const rightCycle = cycleRank(right.cycle);
    if (leftCycle !== rightCycle) {
      return leftCycle - rightCycle;
    }

    const leftUnitScore = expectedUnit && left.unit === expectedUnit ? 0 : 1;
    const rightUnitScore = expectedUnit && right.unit === expectedUnit ? 0 : 1;
    if (leftUnitScore !== rightUnitScore) {
      return leftUnitScore - rightUnitScore;
    }

    return left.name.localeCompare(right.name, "ja");
  });
}

function inferDashboardTimeFrom(months: number, cycle?: string) {
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

function rowsToPoints(rows: Awaited<ReturnType<typeof getData>>["rows"]) {
  const pointMap = new Map<string, IndicatorPoint>();

  rows.forEach((row) => {
    const period = parseDashboardPeriod(row.timeCode);
    if (!period) {
      return;
    }

    pointMap.set(period.period, {
      period: period.period,
      sortKey: period.sortKey,
      value: row.value,
    });
  });

  return [...pointMap.values()].sort((left, right) => left.sortKey - right.sortKey);
}

async function searchDashboardCandidates(config: IndicatorConfig) {
  return getIndicatorInfo({
    searchIndicatorWord: config.searchKeyword ?? config.statSearchKeyword ?? config.title,
    cycle: config.dashboard?.cycle,
    regionalRank: config.dashboard?.regionalRank ?? "2",
    isSeasonalAdjustment: config.dashboard?.isSeasonalAdjustment ?? "1",
  });
}

export async function fetchDashboardIndicatorSeries(
  config: IndicatorConfig,
): Promise<IndicatorSeries | null> {
  if (config.sourceType !== "dashboard") {
    return null;
  }

  const preferredCodes = config.preferredIndicatorCodes ?? [];
  const preferredCandidates = preferredCodes.length > 0
    ? await getIndicatorInfo({ indicatorCode: preferredCodes })
    : [];
  const searchCandidates = preferredCodes.length > 0
    ? []
    : await searchDashboardCandidates(config);
  const candidates = sortCandidates(
    [...preferredCandidates, ...searchCandidates],
    config,
  );
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const data = await getData({
        indicatorCode: candidate.code,
        regionCode: config.selectors?.area
          ? config.selectors.area
          : "00000",
        cycle: config.dashboard?.cycle ?? candidate.cycle,
        regionalRank: config.dashboard?.regionalRank,
        isSeasonalAdjustment:
          config.dashboard?.isSeasonalAdjustment ?? candidate.isSeasonal ?? "1",
        timeFrom: inferDashboardTimeFrom(
          config.dashboard?.timeFromMonths ?? 84,
          config.dashboard?.cycle ?? candidate.cycle,
        ),
      });
      const points = rowsToPoints(data.rows);
      const series = buildIndicatorSeriesFromPoints(config, points, {
        sourceName: candidate.statName
          ? `${candidate.statName}（統計ダッシュボードAPI）`
          : config.sourceName,
        sourceType: "dashboard",
        lastUpdatedAt: data.fetchedAt,
      });
      const freshness = checkFreshness(series.lastPeriod, config.freshnessPolicy);

      if (freshness.isStale) {
        errors.push(`${candidate.name}: ${freshness.reason}`);
        continue;
      }

      return series;
    } catch (error) {
      errors.push(
        `${candidate.name || candidate.code}: ${
          error instanceof Error ? error.message : "取得に失敗しました。"
        }`,
      );
    }
  }

  if (preferredCodes.length > 0) {
    const searchFallbackCandidates = sortCandidates(
      await searchDashboardCandidates(config),
      config,
    );

    for (const candidate of searchFallbackCandidates) {
      try {
        const data = await getData({
          indicatorCode: candidate.code,
          regionCode: config.selectors?.area
            ? config.selectors.area
            : "00000",
          cycle: config.dashboard?.cycle ?? candidate.cycle,
          regionalRank: config.dashboard?.regionalRank,
          isSeasonalAdjustment:
            config.dashboard?.isSeasonalAdjustment ?? candidate.isSeasonal ?? "1",
          timeFrom: inferDashboardTimeFrom(
            config.dashboard?.timeFromMonths ?? 84,
            config.dashboard?.cycle ?? candidate.cycle,
          ),
        });
        const points = rowsToPoints(data.rows);
        const series = buildIndicatorSeriesFromPoints(config, points, {
          sourceName: candidate.statName
            ? `${candidate.statName}（統計ダッシュボードAPI）`
            : config.sourceName,
          sourceType: "dashboard",
          lastUpdatedAt: data.fetchedAt,
        });
        const freshness = checkFreshness(series.lastPeriod, config.freshnessPolicy);

        if (freshness.isStale) {
          errors.push(`${candidate.name}: ${freshness.reason}`);
          continue;
        }

        return series;
      } catch (error) {
        errors.push(
          `${candidate.name || candidate.code}: ${
            error instanceof Error ? error.message : "取得に失敗しました。"
          }`,
        );
      }
    }
  }

  throw new Error(
    errors.length > 0
      ? errors.join(" / ")
      : "統計ダッシュボード API で候補系列を見つけられませんでした。",
  );
}
