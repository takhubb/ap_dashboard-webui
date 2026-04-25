export type IndicatorCategory =
  | "housing"
  | "regional"
  | "macro"
  | "employment"
  | "consumption";

export type IndicatorSourceType = "estat" | "dashboard" | "computed";
export type IndicatorRegionSupport = "national" | "prefecture" | "municipality";
export type IndicatorFreshnessCycle = "month" | "quarter" | "year";
export type IndicatorStaleBehavior = "hide" | "showWarning";
export type IndicatorCalculationMode =
  | "mom"
  | "qoq"
  | "yoy"
  | "level"
  | "latest"
  | "computed";
export type IndicatorChangeType = "percent" | "difference" | "score" | "ratio";
export type IndicatorPeriodStrategy = "timeCode" | "yearMonth";
export type IndicatorChartType = "line" | "bar";
export type IndicatorSelectorValue = string | string[];

export type IndicatorFreshnessPolicy = {
  maxLagMonths: number;
  allowedCycles: IndicatorFreshnessCycle[];
};

export type IndicatorConfig = {
  id: string;
  category: IndicatorCategory;
  title: string;
  sourceName: string;
  sourceType?: IndicatorSourceType;
  statSearchKeyword?: string;
  searchKeyword?: string;
  statsCode?: string;
  preferredTableIds?: string[];
  preferredIndicatorCodes?: string[];
  tableTitleIncludes?: string[];
  unit?: string;
  chartType?: IndicatorChartType;
  calcMode?: IndicatorCalculationMode;
  changeType?: IndicatorChangeType;
  periodStrategy?: IndicatorPeriodStrategy;
  selectors?: Record<string, IndicatorSelectorValue>;
  regionSupport?: IndicatorRegionSupport;
  freshnessPolicy?: IndicatorFreshnessPolicy;
  staleBehavior?: IndicatorStaleBehavior;
  showIssueInSummary?: boolean;
  derivedFrom?: string[];
  dashboard?: {
    regionalRank?: "1" | "2" | "3" | "4";
    cycle?: "1" | "2" | "3" | "4";
    isSeasonalAdjustment?: "1" | "2";
    timeFromMonths?: number;
  };
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
  sourceType?: IndicatorSourceType;
  latestValue: number | null;
  previousValue: number | null;
  changeRate: number | null;
  changeLabel: string;
  changeSuffix: "%" | "pt";
  lastPeriod: string;
  lastUpdatedAt?: string;
  unit?: string;
  chartType: IndicatorChartType;
  notes?: string;
  summary: boolean;
  points: IndicatorPoint[];
  status: "ok" | "error";
  errorMessage?: string;
  isStale?: boolean;
  staleReason?: string;
  isComputed?: boolean;
};

export type DataIssue = {
  id: string;
  title: string;
  sourceName: string;
  sourceType: IndicatorSourceType;
  reason: string;
  severity: "error" | "stale" | "warning";
};

export type PrefectureInfo = {
  code: string;
  name: string;
};

export type RegionalLatestValue = {
  regionCode: string;
  regionName: string;
  latestValue: number | null;
  previousValue: number | null;
  changeRate: number | null;
  threeMonthAverage: number | null;
  twelveMonthAverage: number | null;
  lastPeriod: string;
};

export type RegionalMetricSeries = {
  indicatorId: string;
  title: string;
  sourceName: string;
  sourceType: IndicatorSourceType;
  unit?: string;
  changeLabel: string;
  changeSuffix: "%" | "pt";
  status: "ok" | "error";
  errorMessage?: string;
  lastPeriod: string;
  lastUpdatedAt?: string;
  notes?: string;
  isStale?: boolean;
  staleReason?: string;
  pointsByRegion: Record<string, IndicatorPoint[]>;
  latestByRegion: Record<string, RegionalLatestValue>;
};

export type RegionalDemandScore = {
  regionCode: string;
  regionName: string;
  score: number;
  nationalDifference: number | null;
  inputCount: number;
  missingInputs: string[];
};

export type RegionalHousingMix = {
  regionCode: string;
  regionName: string;
  ownerRatio: number | null;
  rentalRatio: number | null;
  forSaleRatio: number | null;
  ownerDifferenceFromNational: number | null;
  rentalDifferenceFromNational: number | null;
  forSaleDifferenceFromNational: number | null;
  comment: string;
  lastPeriod: string;
};

export type RegionalMomentum = {
  regionCode: string;
  regionName: string;
  shortMomentum: number | null;
  mediumTrend: number | null;
  nationalShortMomentum: number | null;
  nationalMediumTrend: number | null;
  label: "改善" | "横ばい" | "悪化" | "判定不可";
};

export type RegionalDashboardSnapshot = {
  prefectures: PrefectureInfo[];
  defaultRegionCode: string;
  metrics: RegionalMetricSeries[];
  demandScores: RegionalDemandScore[];
  housingMix: RegionalHousingMix[];
  costProxy?: RegionalMetricSeries;
  momentum: RegionalMomentum[];
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
  regional?: RegionalDashboardSnapshot;
  dataIssues: DataIssue[];
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
