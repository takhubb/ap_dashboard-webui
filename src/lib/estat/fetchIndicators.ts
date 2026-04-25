import { INDICATORS } from "@/config/indicators";
import {
  getEStatConfiguration,
  getMetaInfo,
  getStatsData,
  getStatsList,
} from "@/lib/estat/client";
import {
  buildMetaMaps,
  createErrorSeries,
  normalizeIndicatorSeries,
} from "@/lib/estat/normalize";
import { fetchDashboardIndicatorSeries } from "@/lib/dashboard/fetchDashboardIndicator";
import type {
  DashboardSnapshot,
  DataIssue,
  IndicatorConfig,
  IndicatorSeries,
  IndicatorSelectorValue,
  StatisticsTableSummary,
  TableBundle,
} from "@/lib/estat/types";
import { checkFreshness } from "@/lib/freshness";
import { fetchRegionalDashboard } from "@/lib/regional/fetchRegionalDashboard";

const SNAPSHOT_CACHE_TTL_MS = 15 * 60 * 1000;
const TABLE_CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry<T> = {
  cachedAt: number;
  value: T;
};

type MetaMaps = TableBundle["metaMaps"];

declare global {
  var __apDashboardMetaCache:
    | Map<string, CacheEntry<MetaMaps>>
    | undefined;
  var __apDashboardPendingMeta:
    | Map<string, Promise<MetaMaps>>
    | undefined;
  var __apDashboardTableCache:
    | Map<string, CacheEntry<TableBundle>>
    | undefined;
  var __apDashboardPendingTables:
    | Map<string, Promise<TableBundle>>
    | undefined;
  var __apDashboardSnapshotCache:
    | CacheEntry<DashboardSnapshot>
    | undefined;
}

const metaCache = globalThis.__apDashboardMetaCache ?? new Map<string, CacheEntry<MetaMaps>>();
globalThis.__apDashboardMetaCache = metaCache;

const pendingMeta =
  globalThis.__apDashboardPendingMeta ?? new Map<string, Promise<MetaMaps>>();
globalThis.__apDashboardPendingMeta = pendingMeta;

const tableCache = globalThis.__apDashboardTableCache ?? new Map<string, CacheEntry<TableBundle>>();
globalThis.__apDashboardTableCache = tableCache;

const pendingTables =
  globalThis.__apDashboardPendingTables ?? new Map<string, Promise<TableBundle>>();
globalThis.__apDashboardPendingTables = pendingTables;

function isFresh(cacheEntry: CacheEntry<unknown> | undefined, ttlMs: number) {
  if (!cacheEntry) {
    return false;
  }

  return Date.now() - cacheEntry.cachedAt < ttlMs;
}

function buildTableCacheKey(
  tableId: string,
  selectors: Record<string, IndicatorSelectorValue>,
) {
  const serializedSelectors = Object.entries(selectors)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${Array.isArray(value) ? value.join(",") : value}`)
    .join("|");

  return `${tableId}::${serializedSelectors}`;
}

function sortTableCandidates(tables: StatisticsTableSummary[]) {
  return [...tables].sort((left, right) => {
    const leftDate = Date.parse(left.updatedDate ?? left.openDate ?? "1970-01-01");
    const rightDate = Date.parse(right.updatedDate ?? right.openDate ?? "1970-01-01");
    return rightDate - leftDate;
  });
}

async function searchTableId(config: IndicatorConfig) {
  const tables = await getStatsList({
    searchWord: config.statSearchKeyword ?? config.searchKeyword ?? config.title,
    statsCode: config.statsCode,
    limit: 30,
  });

  const filtered = config.tableTitleIncludes?.length
    ? tables.filter((table) =>
        config.tableTitleIncludes?.every((token) => table.title.includes(token)),
      )
    : tables;

  const candidate = sortTableCandidates(filtered.length > 0 ? filtered : tables)[0];
  if (!candidate) {
    throw new Error("候補の統計表を見つけられませんでした。");
  }

  return candidate.id;
}

async function resolveTableId(config: IndicatorConfig) {
  if (config.preferredTableIds && config.preferredTableIds.length > 0) {
    return config.preferredTableIds[0];
  }

  return searchTableId(config);
}

async function loadMetaMaps(tableId: string, forceRefresh: boolean) {
  const cached = metaCache.get(tableId);
  if (!forceRefresh && cached && isFresh(cached, TABLE_CACHE_TTL_MS)) {
    return cached.value;
  }

  const pending = pendingMeta.get(tableId);
  if (!forceRefresh && pending) {
    return pending;
  }

  const promise = (async () => {
    const metaInfo = await getMetaInfo(tableId);
    const metaMaps = buildMetaMaps(metaInfo);

    metaCache.set(tableId, {
      cachedAt: Date.now(),
      value: metaMaps,
    });
    pendingMeta.delete(tableId);

    return metaMaps;
  })();

  pendingMeta.set(tableId, promise);
  return promise;
}

async function loadTableBundle(
  tableId: string,
  selectors: Record<string, IndicatorSelectorValue>,
  forceRefresh: boolean,
) {
  const cacheKey = buildTableCacheKey(tableId, selectors);
  const cached = tableCache.get(cacheKey);
  if (!forceRefresh && cached && isFresh(cached, TABLE_CACHE_TTL_MS)) {
    return cached.value;
  }

  const pending = pendingTables.get(cacheKey);
  if (!forceRefresh && pending) {
    return pending;
  }

  const promise = (async () => {
    const [metaMaps, statsData] = await Promise.all([
      loadMetaMaps(tableId, forceRefresh),
      getStatsData(tableId, selectors),
    ]);

    const bundle: TableBundle = {
      tableId,
      title: statsData.title,
      statisticsName: statsData.statisticsName,
      metaMaps,
      values: statsData.values,
    };

    tableCache.set(cacheKey, {
      cachedAt: Date.now(),
      value: bundle,
    });
    pendingTables.delete(cacheKey);

    return bundle;
  })();

  pendingTables.set(cacheKey, promise);
  return promise;
}

async function buildIndicatorSeries(
  config: IndicatorConfig,
  forceRefresh: boolean,
): Promise<IndicatorSeries> {
  try {
    if (config.sourceType === "dashboard") {
      const dashboardSeries = await fetchDashboardIndicatorSeries(config);
      if (dashboardSeries) {
        return dashboardSeries;
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "統計ダッシュボード API の取得に失敗しました。";
    return createErrorSeries(config, message);
  }

  try {
    const tableId = await resolveTableId(config);
    const bundle = await loadTableBundle(tableId, config.selectors ?? {}, forceRefresh);
    return normalizeIndicatorSeries(config, bundle);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "データ取得時に不明なエラーが発生しました。";
    return createErrorSeries(config, message);
  }
}

function getSeriesFreshnessIssue(series: IndicatorSeries, config: IndicatorConfig) {
  if (series.status !== "ok") {
    return null;
  }

  const freshness = checkFreshness(series.lastPeriod, config.freshnessPolicy);
  return freshness.isStale
    ? freshness.reason ?? "最新期間が古いため除外しました。"
    : null;
}

function buildDataIssue(
  config: IndicatorConfig,
  reason: string,
  severity: DataIssue["severity"],
): DataIssue {
  return {
    id: config.id,
    title: config.title,
    sourceName: config.sourceName,
    sourceType: config.sourceType ?? "estat",
    reason,
    severity,
  };
}

export async function fetchDashboardSnapshot(forceRefresh = false) {
  const configuration = getEStatConfiguration();

  const cachedSnapshot = globalThis.__apDashboardSnapshotCache;
  if (!forceRefresh && cachedSnapshot && isFresh(cachedSnapshot, SNAPSHOT_CACHE_TTL_MS)) {
    return cachedSnapshot.value;
  }

  const series = await Promise.all(
    INDICATORS.map((config) => buildIndicatorSeries(config, forceRefresh)),
  );
  const dataIssues: DataIssue[] = [];
  const indicators = series.flatMap((item, index) => {
    const config = INDICATORS[index];

    if (item.status === "error") {
      dataIssues.push(
        buildDataIssue(
          config,
          item.errorMessage ?? "データ取得時に不明なエラーが発生しました。",
          "error",
        ),
      );
      return [item];
    }

    const freshnessIssue = getSeriesFreshnessIssue(item, config);
    if (!freshnessIssue) {
      return [item];
    }

    const staleItem: IndicatorSeries = {
      ...item,
      isStale: true,
      staleReason: freshnessIssue,
    };

    if (config.staleBehavior === "showWarning") {
      dataIssues.push(buildDataIssue(config, freshnessIssue, "stale"));
      return [staleItem];
    }

    return [];
  });
  const regional = await fetchRegionalDashboard(forceRefresh);
  dataIssues.push(...regional.issues);

  const successCount = indicators.filter((item) => item.status === "ok").length;
  const snapshot: DashboardSnapshot = {
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    indicatorCount: indicators.length,
    successCount,
    errorCount: indicators.length - successCount,
    missingAppId: !configuration.isConfigured,
    message: configuration.message,
    indicators,
    regional: regional.snapshot,
    dataIssues,
  };

  globalThis.__apDashboardSnapshotCache = {
    cachedAt: Date.now(),
    value: snapshot,
  };

  return snapshot;
}
