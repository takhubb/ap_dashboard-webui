import type {
  EStatClassObject,
  EStatValueRow,
  IndicatorChangeType,
  IndicatorConfig,
  IndicatorPeriodStrategy,
  IndicatorPoint,
  IndicatorSeries,
  TableBundle,
} from "@/lib/estat/types";

function parseNumericValue(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.replaceAll(",", "").trim();
  if (!normalized || normalized === "-" || normalized === "…" || normalized === "…") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildMonthlyPeriod(year: number, month: number) {
  return {
    period: `${year}-${String(month).padStart(2, "0")}`,
    sortKey: year * 12 + month,
  };
}

function buildQuarterlyPeriod(year: number, quarter: number) {
  return {
    period: `${year}-Q${quarter}`,
    sortKey: year * 4 + quarter,
  };
}

function buildYearlyPeriod(year: number) {
  return {
    period: `${year}`,
    sortKey: year,
  };
}

function parsePeriodFromLabel(label: string) {
  const monthMatch = label.match(/^(\d{4})年(\d{1,2})月$/);
  if (monthMatch) {
    return buildMonthlyPeriod(Number(monthMatch[1]), Number(monthMatch[2]));
  }

  const compactMonthMatch = label.match(/^(\d{4})(\d{2})$/);
  if (compactMonthMatch) {
    return buildMonthlyPeriod(
      Number(compactMonthMatch[1]),
      Number(compactMonthMatch[2]),
    );
  }

  const quarterMatch = label.match(/^(\d{4})年(\d{1,2})[〜～](\d{1,2})月期$/);
  if (quarterMatch) {
    const endMonth = Number(quarterMatch[3]);
    return buildQuarterlyPeriod(Number(quarterMatch[1]), Math.ceil(endMonth / 3));
  }

  const yearMatch = label.match(/^(\d{4})年$/);
  if (yearMatch) {
    return buildYearlyPeriod(Number(yearMatch[1]));
  }

  return null;
}

function parsePeriodFromCode(code: string) {
  if (/^\d{6}$/.test(code)) {
    return buildMonthlyPeriod(Number(code.slice(0, 4)), Number(code.slice(4, 6)));
  }

  if (/^\d{10}$/.test(code)) {
    const year = Number(code.slice(0, 4));
    const start = Number(code.slice(6, 8));
    const end = Number(code.slice(8, 10));

    if (start >= 1 && start <= 12 && start === end) {
      return buildMonthlyPeriod(year, start);
    }

    if (
      (start === 1 || start === 4 || start === 7 || start === 10) &&
      (end === 3 || end === 6 || end === 9 || end === 12)
    ) {
      return buildQuarterlyPeriod(year, Math.ceil(end / 3));
    }
  }

  return null;
}

function parsePeriodFromStrategy(
  row: EStatValueRow,
  metaMaps: Record<string, Record<string, string>>,
  strategy: IndicatorPeriodStrategy,
) {
  if (strategy === "yearMonth") {
    const yearCode = row["@time"];
    const monthCode = row["@cat01"];
    const yearLabel = yearCode ? metaMaps.time?.[yearCode] ?? yearCode : "";
    const monthLabel = monthCode ? metaMaps.cat01?.[monthCode] ?? monthCode : "";

    const yearMatch = yearLabel.match(/^(\d{4})年$/);
    const monthMatch = monthLabel.match(/^(\d{1,2})月$/);

    if (!yearMatch || !monthMatch) {
      return null;
    }

    return buildMonthlyPeriod(Number(yearMatch[1]), Number(monthMatch[1]));
  }

  const timeCode = row["@time"];
  if (!timeCode) {
    return null;
  }

  const label = metaMaps.time?.[timeCode] ?? timeCode;
  return parsePeriodFromLabel(label) ?? parsePeriodFromCode(timeCode);
}

function getReferencePoint(
  points: IndicatorPoint[],
  latestPoint: IndicatorPoint,
  calcMode: IndicatorConfig["calcMode"],
) {
  if (!calcMode || calcMode === "level" || calcMode === "latest" || calcMode === "computed") {
    return null;
  }

  if (calcMode === "mom" || calcMode === "qoq") {
    const latestIndex = points.findIndex((point) => point.period === latestPoint.period);
    return latestIndex > 0 ? points[latestIndex - 1] : null;
  }

  const offset = latestPoint.period.includes("-Q")
    ? 4
    : latestPoint.period.includes("-")
      ? 12
      : 1;
  return points.find((point) => point.sortKey === latestPoint.sortKey - offset) ?? null;
}

function getChangeLabel(
  calcMode: IndicatorConfig["calcMode"],
  changeType: IndicatorChangeType,
  lastPeriod: string,
) {
  if (!calcMode || calcMode === "level" || calcMode === "latest") {
    return "水準";
  }

  if (calcMode === "computed") {
    return changeType === "score" ? "スコア" : "独自算出";
  }

  const isQuarterly = lastPeriod.includes("-Q");
  const isMonthly = lastPeriod.includes("-");

  if (calcMode === "mom") {
    return changeType === "difference" ? "前月差" : "前月比";
  }

  if (calcMode === "qoq") {
    return changeType === "difference" ? "前期差" : "前期比";
  }

  if (calcMode === "yoy") {
    if (isQuarterly) {
      return changeType === "difference" ? "前年同期差" : "前年同期比";
    }

    if (isMonthly) {
      return changeType === "difference" ? "前年差" : "前年同月比";
    }

    return changeType === "difference" ? "前年差" : "前年比";
  }

  return "変化";
}

function calculateChange(
  latestValue: number | null,
  referenceValue: number | null,
  changeType: IndicatorChangeType,
) {
  if (
    latestValue === null ||
    referenceValue === null ||
    Number.isNaN(latestValue) ||
    Number.isNaN(referenceValue)
  ) {
    return null;
  }

  if (changeType === "difference") {
    return latestValue - referenceValue;
  }

  if (referenceValue === 0) {
    return null;
  }

  return ((latestValue - referenceValue) / Math.abs(referenceValue)) * 100;
}

export function buildIndicatorSeriesFromPoints(
  config: IndicatorConfig,
  points: IndicatorPoint[],
  options?: {
    notes?: string;
    sourceName?: string;
    sourceType?: IndicatorConfig["sourceType"];
    lastUpdatedAt?: string;
    isComputed?: boolean;
  },
) {
  const sortedPoints = [...points].sort((left, right) => left.sortKey - right.sortKey);

  if (sortedPoints.length === 0) {
    throw new Error("系列データに有効な期間が含まれていませんでした。");
  }

  const latestPoint = [...sortedPoints].reverse().find((point) => point.value !== null);
  if (!latestPoint) {
    throw new Error("系列データに有効な数値が含まれていませんでした。");
  }

  const referencePoint = getReferencePoint(sortedPoints, latestPoint, config.calcMode);
  const latestValue = latestPoint.value;
  const previousValue = referencePoint?.value ?? null;
  const changeType = config.changeType ?? "percent";
  const changeSuffix: "%" | "pt" = changeType === "difference" ? "pt" : "%";

  return {
    indicatorId: config.id,
    category: config.category,
    title: config.title,
    sourceName: options?.sourceName ?? config.sourceName,
    sourceType: options?.sourceType ?? config.sourceType ?? "estat",
    latestValue,
    previousValue,
    changeRate: calculateChange(latestValue, previousValue, changeType),
    changeLabel: getChangeLabel(config.calcMode, changeType, latestPoint.period),
    changeSuffix,
    lastPeriod: latestPoint.period,
    lastUpdatedAt: options?.lastUpdatedAt,
    unit: config.unit,
    chartType: config.chartType ?? "line",
    notes: options?.notes ?? config.notes,
    summary: Boolean(config.summary),
    points: sortedPoints,
    status: "ok" as const,
    isComputed: options?.isComputed,
  };
}

export function buildMetaMaps(classObjects: EStatClassObject[]) {
  return classObjects.reduce<Record<string, Record<string, string>>>((accumulator, item) => {
    accumulator[item.id] = item.values.reduce<Record<string, string>>(
      (valueMap, value) => {
        valueMap[value.code] = value.name;
        return valueMap;
      },
      {},
    );
    return accumulator;
  }, {});
}

export function selectRows(
  values: EStatValueRow[],
  selectors: IndicatorConfig["selectors"] = {},
) {
  return values.filter((row) =>
    Object.entries(selectors).every(([dimension, expected]) => {
      if (Array.isArray(expected)) {
        return expected.includes(row[`@${dimension}`]);
      }

      return row[`@${dimension}`] === expected;
    }),
  );
}

export function normalizeIndicatorSeries(
  config: IndicatorConfig,
  bundle: TableBundle,
) {
  const rows = selectRows(bundle.values, config.selectors);
  const pointMap = new Map<string, IndicatorPoint>();

  rows.forEach((row) => {
    const period = parsePeriodFromStrategy(
      row,
      bundle.metaMaps,
      config.periodStrategy ?? "timeCode",
    );
    if (!period) {
      return;
    }

    pointMap.set(period.period, {
      period: period.period,
      sortKey: period.sortKey,
      value: parseNumericValue(row.$),
    });
  });

  const points = Array.from(pointMap.values()).sort((left, right) => {
    return left.sortKey - right.sortKey;
  });

  if (points.length === 0) {
    throw new Error("選択条件に一致するデータ系列が見つかりませんでした。");
  }

  return buildIndicatorSeriesFromPoints(config, points);
}

export function createErrorSeries(
  config: IndicatorConfig,
  errorMessage: string,
): IndicatorSeries {
  return {
    indicatorId: config.id,
    category: config.category,
    title: config.title,
    sourceName: config.sourceName,
    sourceType: config.sourceType ?? "estat",
    latestValue: null,
    previousValue: null,
    changeRate: null,
    changeLabel: config.calcMode === "yoy" ? "前年同月比" : "前月比",
    changeSuffix: "%",
    lastPeriod: "取得失敗",
    unit: config.unit,
    chartType: config.chartType ?? "line",
    notes: config.notes,
    summary: Boolean(config.summary),
    points: [],
    status: "error",
    errorMessage,
  };
}
