import { buildIndicatorSeriesFromPoints } from "@/lib/estat/normalize";
import type {
  IndicatorConfig,
  IndicatorPoint,
  IndicatorSeries,
} from "@/lib/estat/types";

type OfficialSeriesBundle = {
  pointsById: Record<string, IndicatorPoint[]>;
  sourceName: string;
};

export type OfficialLoaderState = {
  gdpReal?: Promise<OfficialSeriesBundle>;
  housingStarts?: Promise<OfficialSeriesBundle>;
  industrialProduction?: Promise<OfficialSeriesBundle>;
  wageIndexes?: Promise<OfficialSeriesBundle>;
};

type DashboardGroup = {
  cycle: "1" | "2" | "3" | "4";
  indicatorCodesById: Record<string, string>;
  regionalRank: string;
  seasonal: "1" | "2";
  sourceName: string;
};

type DashboardPayload = {
  GET_STATS?: {
    RESULT?: {
      errorMsg?: string;
      status?: number | string;
    };
    STATISTICAL_DATA?: {
      DATA_INF?: {
        DATA_OBJ?: Array<{
          VALUE?: Record<string, string>;
        }>;
        VALUE?: Record<string, string> | Array<Record<string, string>>;
      };
    };
  };
};

type AnchorLink = {
  href: string;
  text: string;
};

const DASHBOARD_API_URL = "https://dashboard.e-stat.go.jp/api/1.0/Json/getData";
const DASHBOARD_FETCH_TIMEOUT_MS = 30_000;
const GDP_INDEX_URL = "https://www.esri.cao.go.jp/jp/sna/sokuhou/sokuhou_top.html";

const DASHBOARD_GROUPS = {
  gdpReal: {
    cycle: "2",
    indicatorCodesById: {
      "gdp-real": "0705020401000010000",
    },
    regionalRank: "2",
    seasonal: "2",
    sourceName: "国内総生産（支出側）（実質）2015年基準（統計ダッシュボードAPI）",
  },
  housingStarts: {
    cycle: "1",
    indicatorCodesById: {
      "housing-starts-total": "0802010103000010000",
      "housing-starts-owner": "0802010103010010010",
      "housing-starts-rental": "0802010103010010020",
      "housing-starts-for-sale": "0802010103010010030",
    },
    regionalRank: "2",
    seasonal: "1",
    sourceName: "住宅着工統計調査（建築着工統計調査）（統計ダッシュボードAPI）",
  },
  industrialProduction: {
    cycle: "1",
    indicatorCodesById: {
      "industrial-production": "0502070301000090010",
    },
    regionalRank: "2",
    seasonal: "2",
    sourceName: "鉱工業生産指数 2020年基準（統計ダッシュボードAPI）",
  },
  wageIndexes: {
    cycle: "1",
    indicatorCodesById: {
      "nominal-wage-index": "0302030202010090010",
      "real-wage-index": "0302030201010090010",
    },
    regionalRank: "2",
    seasonal: "2",
    sourceName: "毎月勤労統計調査 賃金指数（統計ダッシュボードAPI）",
  },
} satisfies Record<string, DashboardGroup>;

function asArray<T>(value: T | T[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/");
}

function decodeBuffer(buffer: Buffer, encoding = "utf-8") {
  return new TextDecoder(encoding).decode(buffer);
}

function extractAnchors(html: string) {
  return [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(
    (match) => ({
      href: decodeHtmlEntities(match[1]),
      text: match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    }),
  );
}

function findAnchor(
  anchors: AnchorLink[],
  predicate: (anchor: AnchorLink) => boolean,
  label: string,
) {
  const anchor = anchors.find(predicate);
  if (!anchor) {
    throw new Error(`${label} を見つけられませんでした。`);
  }

  return anchor;
}

function parseDashboardNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replaceAll(",", "").trim();
  if (!normalized || normalized === "-" || normalized === "…" || normalized === "…") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDashboardPeriod(timeCode: string) {
  const monthlyMatch = timeCode.match(/^(\d{4})(\d{2})00$/);
  if (monthlyMatch) {
    const year = Number(monthlyMatch[1]);
    const month = Number(monthlyMatch[2]);
    if (month >= 1 && month <= 12) {
      return {
        period: `${year}-${String(month).padStart(2, "0")}`,
        sortKey: year * 12 + month,
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
    };
  }

  const yearlyMatch = timeCode.match(/^(\d{4})(?:CY|FY)00$/);
  if (yearlyMatch) {
    const year = Number(yearlyMatch[1]);
    return {
      period: `${year}`,
      sortKey: year,
    };
  }

  return null;
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  const flushField = () => {
    currentRow.push(currentField);
    currentField = "";
  };

  const flushRow = () => {
    if (currentRow.some((cell) => cell.trim().length > 0)) {
      rows.push(currentRow);
    }
    currentRow = [];
  };

  const normalized = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (inQuotes) {
      if (character === "\"") {
        if (normalized[index + 1] === "\"") {
          currentField += "\"";
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += character;
      }
      continue;
    }

    if (character === "\"") {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      flushField();
      continue;
    }

    if (character === "\n") {
      flushField();
      flushRow();
      continue;
    }

    if (character !== "\r") {
      currentField += character;
    }
  }

  flushField();
  flushRow();

  return rows;
}

function parseCabinetOfficeQuarter(value: string, currentYear: number | null) {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const withYearMatch = normalized.match(/^(\d{4})\/\s*(\d{1,2})-\s*(\d{1,2})\.$/);
  if (withYearMatch) {
    const year = Number(withYearMatch[1]);
    const endMonth = Number(withYearMatch[3]);
    return {
      year,
      quarter: Math.ceil(endMonth / 3),
    };
  }

  const quarterOnlyMatch = normalized.match(/^(\d{1,2})-\s*(\d{1,2})\.$/);
  if (!quarterOnlyMatch || currentYear === null) {
    return null;
  }

  const endMonth = Number(quarterOnlyMatch[2]);
  return {
    year: currentYear,
    quarter: Math.ceil(endMonth / 3),
  };
}

async function fetchBuffer(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(DASHBOARD_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`最新ファイルを取得できませんでした: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(DASHBOARD_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`最新ページを取得できませんでした: ${response.status}`);
  }

  return response.text();
}

function resolveUrl(baseUrl: string, href: string) {
  return new URL(href, baseUrl).toString();
}

function sortPoints(points: IndicatorPoint[]) {
  return [...points].sort((left, right) => left.sortKey - right.sortKey);
}

function extractValueRows(payload: DashboardPayload) {
  const dataInf = payload.GET_STATS?.STATISTICAL_DATA?.DATA_INF;
  const directValues = asArray(dataInf?.VALUE);

  if (directValues.length > 0) {
    return directValues;
  }

  return asArray(dataInf?.DATA_OBJ)
    .map((item) => item.VALUE)
    .filter((item): item is Record<string, string> => Boolean(item));
}

async function fetchDashboardBundle(group: DashboardGroup): Promise<OfficialSeriesBundle> {
  const indicatorCodes = Object.values(group.indicatorCodesById);
  const params = new URLSearchParams({
    Lang: "JP",
    IndicatorCode: indicatorCodes.join(","),
    RegionalRank: group.regionalRank,
    Cycle: group.cycle,
    IsSeasonalAdjustment: group.seasonal,
    MetaGetFlg: "N",
  });

  const response = await fetch(`${DASHBOARD_API_URL}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(DASHBOARD_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`統計ダッシュボード API の取得に失敗しました: ${response.status}`);
  }

  const payload = (await response.json()) as DashboardPayload;
  const result = payload.GET_STATS?.RESULT;
  const status = Number(result?.status ?? 0);
  const errorMessage = result?.errorMsg?.trim();
  const rows = extractValueRows(payload);

  if (status > 1) {
    throw new Error(errorMessage || "統計ダッシュボード API がエラーを返しました。");
  }

  if (rows.length === 0) {
    throw new Error("統計ダッシュボード API から系列データを取得できませんでした。");
  }

  const indicatorIdsByCode = new Map(
    Object.entries(group.indicatorCodesById).map(([indicatorId, indicatorCode]) => [
      indicatorCode,
      indicatorId,
    ]),
  );
  const pointMapsById = Object.fromEntries(
    Object.keys(group.indicatorCodesById).map((indicatorId) => [
      indicatorId,
      new Map<string, IndicatorPoint>(),
    ]),
  ) as Record<string, Map<string, IndicatorPoint>>;

  rows.forEach((row) => {
    const indicatorCode = row["@indicator"];
    const timeCode = row["@time"];
    const indicatorId = indicatorCode ? indicatorIdsByCode.get(indicatorCode) : undefined;
    const period = timeCode ? parseDashboardPeriod(timeCode) : null;

    if (!indicatorId || !period) {
      return;
    }

    pointMapsById[indicatorId].set(period.period, {
      period: period.period,
      sortKey: period.sortKey,
      value: parseDashboardNumber(row.$),
    });
  });

  return {
    sourceName: group.sourceName,
    pointsById: Object.fromEntries(
      Object.entries(pointMapsById).map(([indicatorId, pointMap]) => [
        indicatorId,
        sortPoints(Array.from(pointMap.values())),
      ]),
    ),
  };
}

async function loadGdpBundle(): Promise<OfficialSeriesBundle> {
  try {
    const indexHtml = await fetchText(GDP_INDEX_URL);
    const gdpPageLink = findAnchor(
      extractAnchors(indexHtml),
      (anchor) => anchor.href.includes("gdemenuja.html"),
      "四半期別GDP速報の詳細ページ",
    );
    const gdpPageUrl = resolveUrl(GDP_INDEX_URL, gdpPageLink.href);
    const gdpPageHtml = await fetchText(gdpPageUrl);
    const csvMatch = gdpPageHtml.match(/href="((?:[^"]*\/)?tables\/gaku-jk\d+\.csv)"/i);

    if (!csvMatch) {
      throw new Error("四半期別GDP速報の CSV を見つけられませんでした。");
    }

    const csvUrl = resolveUrl(gdpPageUrl, decodeHtmlEntities(csvMatch[1]));
    const rows = parseCsvRows(decodeBuffer(await fetchBuffer(csvUrl), "shift_jis"));
    const points: IndicatorPoint[] = [];
    let currentYear: number | null = null;

    rows.forEach((row) => {
      const period = parseCabinetOfficeQuarter(row[0] ?? "", currentYear);
      if (!period) {
        return;
      }

      currentYear = period.year;
      points.push({
        period: `${period.year}-Q${period.quarter}`,
        sortKey: period.year * 4 + period.quarter,
        value: parseDashboardNumber(row[1]),
      });
    });

    if (points.length === 0) {
      throw new Error("四半期別GDP速報の時系列データを解析できませんでした。");
    }

    return {
      sourceName: "四半期別GDP速報 実質季節調整系列",
      pointsById: {
        "gdp-real": sortPoints(points),
      },
    };
  } catch {
    return fetchDashboardBundle(DASHBOARD_GROUPS.gdpReal);
  }
}

export async function fetchOfficialIndicatorSeries(
  config: IndicatorConfig,
  loaders: OfficialLoaderState,
) {
  let bundle: OfficialSeriesBundle | null = null;

  switch (config.id) {
    case "gdp-real":
      loaders.gdpReal ??= loadGdpBundle();
      bundle = await loaders.gdpReal;
      break;
    case "housing-starts-total":
    case "housing-starts-owner":
    case "housing-starts-rental":
    case "housing-starts-for-sale":
      loaders.housingStarts ??= fetchDashboardBundle(DASHBOARD_GROUPS.housingStarts);
      bundle = await loaders.housingStarts;
      break;
    case "industrial-production":
      loaders.industrialProduction ??= fetchDashboardBundle(DASHBOARD_GROUPS.industrialProduction);
      bundle = await loaders.industrialProduction;
      break;
    case "nominal-wage-index":
    case "real-wage-index":
      loaders.wageIndexes ??= fetchDashboardBundle(DASHBOARD_GROUPS.wageIndexes);
      bundle = await loaders.wageIndexes;
      break;
    default:
      return null;
  }

  const points = bundle.pointsById[config.id];
  if (!points || points.length === 0) {
    throw new Error("最新系列は取得できましたが、対象系列を特定できませんでした。");
  }

  return buildIndicatorSeriesFromPoints(config, points, {
    sourceName: bundle.sourceName,
  }) satisfies IndicatorSeries;
}
