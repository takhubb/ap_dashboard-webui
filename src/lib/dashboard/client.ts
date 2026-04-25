import type { IndicatorPoint } from "@/lib/estat/types";

const DASHBOARD_BASE_URL = "https://dashboard.e-stat.go.jp/api/1.0/Json";
const DASHBOARD_FETCH_TIMEOUT_MS = 30_000;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

export type DashboardCycleCode = "1" | "2" | "3" | "4";
export type DashboardRegionalRankCode = "1" | "2" | "3" | "4";
export type DashboardSeasonalCode = "1" | "2";

export type DashboardIndicatorInfo = {
  code: string;
  name: string;
  shortName?: string;
  statName?: string;
  unit?: string;
  cycle?: DashboardCycleCode;
  cycleName?: string;
  regionalRank?: DashboardRegionalRankCode;
  regionalRankName?: string;
  isSeasonal?: DashboardSeasonalCode;
  isSeasonalName?: string;
  fromDate?: string;
  toDate?: string;
};

export type DashboardRegionInfo = {
  code: string;
  name: string;
  level?: string;
};

export type DashboardDataRow = {
  indicatorCode: string;
  regionCode: string;
  timeCode: string;
  value: number | null;
  unitCode?: string;
  statCode?: string;
  cycle?: DashboardCycleCode;
  regionalRank?: DashboardRegionalRankCode;
  isSeasonal?: DashboardSeasonalCode;
  isProvisional?: string;
};

export type DashboardDataResponse = {
  rows: DashboardDataRow[];
  sourceNames: string[];
  fetchedAt: string;
};

export class DashboardApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray<T>(value: T | T[] | undefined | null) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function parseNumber(rawValue: unknown) {
  if (typeof rawValue !== "string" && typeof rawValue !== "number") {
    return null;
  }

  const normalized = String(rawValue).replaceAll(",", "").trim();
  if (!normalized || normalized === "-" || normalized === "…" || normalized === "***") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | string[] | number | undefined,
) {
  if (value === undefined) {
    return;
  }

  params.set(key, Array.isArray(value) ? value.join(",") : String(value));
}

async function requestDashboard<T extends JsonObject>(
  path: "getIndicatorInfo" | "getRegionInfo" | "getData",
  params: Record<string, string | string[] | number | undefined>,
) {
  const searchParams = new URLSearchParams();
  searchParams.set("Lang", "JP");

  Object.entries(params).forEach(([key, value]) => appendParam(searchParams, key, value));

  const response = await fetch(`${DASHBOARD_BASE_URL}/${path}?${searchParams.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(DASHBOARD_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new DashboardApiError(`統計ダッシュボード API returned ${response.status}.`);
  }

  const payload = (await response.json()) as T;
  const root = Object.values(payload).find(isRecord);
  const result = isRecord(root) && isRecord(root.RESULT) ? root.RESULT : undefined;
  const status = Number(result?.status ?? result?.STATUS ?? 0);
  const errorMessage = text(result?.errorMsg) ?? text(result?.ERROR_MSG);

  if (status > 1) {
    throw new DashboardApiError(errorMessage || "統計ダッシュボード API がエラーを返しました。");
  }

  return payload;
}

function normalizeIndicatorInfo(raw: Record<string, unknown>): DashboardIndicatorInfo[] {
  const classes = asArray(raw.CLASS).filter(isRecord);

  return classes.map((classItem) => {
    const cycle = isRecord(classItem.cycle) ? classItem.cycle : undefined;
    const regionalRank = isRecord(classItem.RegionalRank)
      ? classItem.RegionalRank
      : undefined;
    const isSeasonal = isRecord(classItem.IsSeasonal)
      ? classItem.IsSeasonal
      : undefined;

    return {
      code: String(raw["@code"] ?? ""),
      name: String(classItem["@name"] ?? raw["@name"] ?? ""),
      shortName: text(classItem["@sname"]),
      statName: text(classItem["@statName"]),
      unit: text(classItem["@unit"]),
      cycle: text(cycle?.["@code"]) as DashboardCycleCode | undefined,
      cycleName: text(cycle?.["@name"]),
      regionalRank: text(regionalRank?.["@code"]) as DashboardRegionalRankCode | undefined,
      regionalRankName: text(regionalRank?.["@name"]),
      isSeasonal: text(isSeasonal?.["@code"]) as DashboardSeasonalCode | undefined,
      isSeasonalName: text(isSeasonal?.["@name"]),
      fromDate: text(classItem["@fromDate"]),
      toDate: text(classItem["@toDate"]),
    };
  });
}

export async function getIndicatorInfo(params: {
  indicatorCode?: string | string[];
  searchIndicatorWord?: string;
  category?: string;
  time?: string;
  timeFrom?: string;
  timeTo?: string;
  cycle?: DashboardCycleCode;
  regionalRank?: DashboardRegionalRankCode;
  isSeasonalAdjustment?: DashboardSeasonalCode;
  statCode?: string;
}) {
  const payload = await requestDashboard<JsonObject>("getIndicatorInfo", {
    IndicatorCode: params.indicatorCode,
    SearchIndicatorWord: params.searchIndicatorWord,
    Category: params.category,
    Time: params.time,
    TimeFrom: params.timeFrom,
    TimeTo: params.timeTo,
    Cycle: params.cycle,
    RegionalRank: params.regionalRank,
    IsSeasonalAdjustment: params.isSeasonalAdjustment,
    StatCode: params.statCode,
  });

  const root = payload.GET_META_INDICATOR_INF;
  const metadataInf = isRecord(root) && isRecord(root.METADATA_INF)
    ? root.METADATA_INF
    : undefined;
  const classInf = metadataInf && isRecord(metadataInf.CLASS_INF)
    ? metadataInf.CLASS_INF
    : undefined;
  const classObjects = asArray<unknown>(classInf?.CLASS_OBJ).filter(isRecord);

  return classObjects.flatMap(normalizeIndicatorInfo).filter((item) => item.code);
}

export async function getRegionInfo(params: {
  regionCode?: string | string[];
  parentRegionCode?: string;
  regionLevel?: string | string[];
  searchRegionWord?: string;
}) {
  const payload = await requestDashboard<JsonObject>("getRegionInfo", {
    RegionCode: params.regionCode,
    ParentRegionCode: params.parentRegionCode,
    RegionLevel: params.regionLevel,
    SearchRegionWord: params.searchRegionWord,
  });

  const root = payload.GET_META_REGION_INF;
  const metadataInf = isRecord(root) && isRecord(root.METADATA_INF)
    ? root.METADATA_INF
    : undefined;
  const classInf = metadataInf && isRecord(metadataInf.CLASS_INF)
    ? metadataInf.CLASS_INF
    : undefined;
  const classObjects = asArray<unknown>(classInf?.CLASS_OBJ).filter(isRecord);

  return classObjects.flatMap((classObject) =>
    asArray<unknown>(classObject.CLASS)
      .filter(isRecord)
      .map((region) => ({
        code: String(region["@regionCode"] ?? ""),
        name: String(region["@name"] ?? ""),
        level: text(region["@level"]),
      })),
  ).filter((region) => region.code);
}

function extractValueRows(payload: JsonObject) {
  const root = payload.GET_STATS;
  const statisticalData =
    isRecord(root) && isRecord(root.STATISTICAL_DATA) ? root.STATISTICAL_DATA : undefined;
  const dataInf =
    statisticalData && isRecord(statisticalData.DATA_INF) ? statisticalData.DATA_INF : undefined;
  const directValues = asArray<unknown>(dataInf?.VALUE).filter(isRecord);

  if (directValues.length > 0) {
    return directValues;
  }

  return asArray<unknown>(dataInf?.DATA_OBJ)
    .filter(isRecord)
    .map((item) => item.VALUE)
    .filter(isRecord);
}

function extractSourceNames(payload: JsonObject) {
  const root = payload.GET_STATS;
  const statisticalData =
    isRecord(root) && isRecord(root.STATISTICAL_DATA) ? root.STATISTICAL_DATA : undefined;
  const tableInf =
    statisticalData && isRecord(statisticalData.TABLE_INF) ? statisticalData.TABLE_INF : undefined;
  const statNames = asArray<unknown>(tableInf?.STAT_NAME).filter(isRecord);

  return statNames
    .map((item) => text(item.$))
    .filter((item): item is string => Boolean(item));
}

export function parseDashboardPeriod(timeCode: string): IndicatorPoint | null {
  const monthlyMatch = timeCode.match(/^(\d{4})(\d{2})00$/);
  if (monthlyMatch) {
    const year = Number(monthlyMatch[1]);
    const month = Number(monthlyMatch[2]);
    if (month >= 1 && month <= 12) {
      return {
        period: `${year}-${String(month).padStart(2, "0")}`,
        sortKey: year * 12 + month,
        value: null,
      };
    }
  }

  const quarterlyMatch = timeCode.match(/^(\d{4})([1-4])Q00$/);
  if (quarterlyMatch) {
    const year = Number(quarterlyMatch[1]);
    const quarter = Number(quarterlyMatch[2]);
    return {
      period: `${year}-Q${quarter}`,
      sortKey: year * 4 + quarter,
      value: null,
    };
  }

  const yearlyMatch = timeCode.match(/^(\d{4})(?:CY|FY)00$/);
  if (yearlyMatch) {
    const year = Number(yearlyMatch[1]);
    return {
      period: `${year}`,
      sortKey: year,
      value: null,
    };
  }

  return null;
}

export async function getData(params: {
  indicatorCode: string | string[];
  regionCode?: string | string[];
  parentRegionCode?: string;
  regionLevel?: string | string[];
  time?: string;
  timeFrom?: string;
  timeTo?: string;
  cycle?: DashboardCycleCode;
  regionalRank?: DashboardRegionalRankCode;
  isSeasonalAdjustment?: DashboardSeasonalCode;
  metaGetFlg?: "Y" | "N" | "1" | "2";
}): Promise<DashboardDataResponse> {
  const payload = await requestDashboard<JsonObject>("getData", {
    IndicatorCode: params.indicatorCode,
    RegionCode: params.regionCode,
    ParentRegionCode: params.parentRegionCode,
    RegionLevel: params.regionLevel,
    Time: params.time,
    TimeFrom: params.timeFrom,
    TimeTo: params.timeTo,
    Cycle: params.cycle,
    RegionalRank: params.regionalRank,
    IsSeasonalAdjustment: params.isSeasonalAdjustment,
    MetaGetFlg: params.metaGetFlg ?? "N",
  });

  return {
    rows: extractValueRows(payload).map((row) => ({
      indicatorCode: String(row["@indicator"] ?? ""),
      regionCode: String(row["@regionCode"] ?? ""),
      timeCode: String(row["@time"] ?? ""),
      value: parseNumber(row.$),
      unitCode: text(row["@unit"]),
      statCode: text(row["@stat"]),
      cycle: text(row["@cycle"]) as DashboardCycleCode | undefined,
      regionalRank: text(row["@regionRank"]) as DashboardRegionalRankCode | undefined,
      isSeasonal: text(row["@isSeasonal"]) as DashboardSeasonalCode | undefined,
      isProvisional: text(row["@isProvisional"]),
    })),
    sourceNames: extractSourceNames(payload),
    fetchedAt: new Date().toISOString(),
  };
}
