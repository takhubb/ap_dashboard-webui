export type IndicatorCategory =
  | "housing"
  | "macro"
  | "employment"
  | "consumption";

export type IndicatorCalculationMode = "mom" | "qoq" | "yoy" | "level";
export type IndicatorChangeType = "percent" | "difference";
export type IndicatorPeriodStrategy = "timeCode" | "yearMonth";
export type IndicatorChartType = "line" | "bar";

export type IndicatorConfig = {
  id: string;
  category: IndicatorCategory;
  title: string;
  sourceName: string;
  statSearchKeyword: string;
  statsCode?: string;
  preferredTableIds?: string[];
  tableTitleIncludes?: string[];
  unit?: string;
  chartType?: IndicatorChartType;
  calcMode?: IndicatorCalculationMode;
  changeType?: IndicatorChangeType;
  periodStrategy?: IndicatorPeriodStrategy;
  selectors: Record<string, string>;
  notes?: string;
  summary?: boolean;
};

export type IndicatorPoint = {
  period: string;
  value: number | null;
  sortKey: number;
};

export type IndicatorSeries = {
  indicatorId: string;
  category: IndicatorCategory;
  title: string;
  sourceName: string;
  latestValue: number | null;
  previousValue: number | null;
  changeRate: number | null;
  changeLabel: string;
  changeSuffix: "%" | "pt";
  lastPeriod: string;
  unit?: string;
  chartType: IndicatorChartType;
  notes?: string;
  summary: boolean;
  points: IndicatorPoint[];
  status: "ok" | "error";
  errorMessage?: string;
};

export type DashboardSnapshot = {
  generatedAt: string;
  lastUpdatedAt: string | null;
  indicatorCount: number;
  successCount: number;
  errorCount: number;
  missingAppId: boolean;
  message?: string;
  indicators: IndicatorSeries[];
};

export type StatisticsTableSummary = {
  id: string;
  title: string;
  statisticsName: string;
  statName: string;
  updatedDate?: string;
  openDate?: string;
  cycle?: string;
};

export type EStatClassObject = {
  id: string;
  name: string;
  values: Array<{
    code: string;
    name: string;
    unit?: string;
  }>;
};

export type EStatValueRow = Record<string, string>;

export type TableBundle = {
  tableId: string;
  title: string;
  statisticsName: string;
  metaMaps: Record<string, Record<string, string>>;
  values: EStatValueRow[];
};

