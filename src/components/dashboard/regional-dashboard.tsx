"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  RegionalDashboardSnapshot,
  RegionalMetricSeries,
} from "@/lib/estat/types";
import {
  formatChange,
  formatNumber,
  formatPeriod,
  formatValue,
  slicePoints,
  toneFromChange,
} from "@/lib/utils";

type RegionalDashboardProps = {
  regional?: RegionalDashboardSnapshot;
  windowSize: number;
};

const NATIONAL_CODE = "00000";

const RANKING_METRICS = [
  "pref-housing-starts-total",
  "pref-housing-floor-area",
  "pref-planned-construction-cost",
  "pref-public-construction-orders",
] as const;

function getMetric(regional: RegionalDashboardSnapshot, id: string) {
  return regional.metrics.find((metric) => metric.indicatorId === id);
}

function rankingRows(metric: RegionalMetricSeries, regional: RegionalDashboardSnapshot) {
  return regional.prefectures
    .map((prefecture) => metric.latestByRegion[prefecture.code])
    .filter((item) => item?.changeRate !== null && item?.changeRate !== undefined)
    .sort((left, right) => (right.changeRate ?? -Infinity) - (left.changeRate ?? -Infinity));
}

function compactRanking(metric: RegionalMetricSeries, regional: RegionalDashboardSnapshot) {
  const rows = rankingRows(metric, regional).slice(0, 10);

  return (
    <Card key={metric.indicatorId} className="h-full">
      <CardHeader className="border-b border-[var(--border-subtle)]">
        <CardTitle>{metric.title} YoY ランキング</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-5 text-sm text-[var(--muted-foreground)]">
            ランキングに使える最新値がありません。
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.regionCode}
                  className="border-b border-[var(--border-subtle)] last:border-b-0"
                >
                  <td className="w-12 px-4 py-3 text-[var(--muted-foreground)]">
                    {index + 1}
                  </td>
                  <td className="px-2 py-3 font-medium">{row.regionName}</td>
                  <td className="px-4 py-3 text-right">
                    {formatChange(row.changeRate, "%")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function demandScoreTable(
  title: string,
  scores: RegionalDashboardSnapshot["demandScores"],
) {
  return (
    <Card>
      <CardHeader className="border-b border-[var(--border-subtle)]">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {scores.length === 0 ? (
          <div className="p-5 text-sm text-[var(--muted-foreground)]">
            独自算出に必要な入力データが不足しています。
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {scores.map((score, index) => (
                <tr
                  key={score.regionCode}
                  className="border-b border-[var(--border-subtle)] last:border-b-0"
                >
                  <td className="w-12 px-4 py-3 text-[var(--muted-foreground)]">
                    {index + 1}
                  </td>
                  <td className="px-2 py-3 font-medium">{score.regionName}</td>
                  <td className="px-4 py-3 text-right">
                    {formatNumber(score.score, 1)}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--muted-foreground)]">
                    全国差 {formatChange(score.nationalDifference, "pt")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function DetailMetricCard({
  metric,
  regionCode,
}: {
  metric: RegionalMetricSeries;
  regionCode: string;
}) {
  const latest = metric.latestByRegion[regionCode];

  return (
    <Card>
      <CardHeader className="border-b border-[var(--border-subtle)]">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{metric.title}</CardTitle>
          <Badge variant={toneFromChange(latest?.changeRate ?? null)}>
            {metric.changeLabel} {formatChange(latest?.changeRate ?? null, metric.changeSuffix)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              最新値
            </div>
            <div className="mt-1 text-xl font-semibold">
              {formatValue(latest?.latestValue ?? null, metric.unit)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              3か月移動平均
            </div>
            <div className="mt-1 text-xl font-semibold">
              {formatValue(latest?.threeMonthAverage ?? null, metric.unit)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              12か月移動平均
            </div>
            <div className="mt-1 text-xl font-semibold">
              {formatValue(latest?.twelveMonthAverage ?? null, metric.unit)}
            </div>
          </div>
        </div>
        <div className="grid gap-3 rounded-2xl bg-[var(--surface-muted)] p-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              最新対象期間
            </div>
            <div className="mt-1 font-medium">
              {latest ? formatPeriod(latest.lastPeriod) : "データなし"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              最終更新日
            </div>
            <div className="mt-1 font-medium">
              {metric.lastUpdatedAt
                ? new Intl.DateTimeFormat("ja-JP").format(new Date(metric.lastUpdatedAt))
                : "不明"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              出典
            </div>
            <div className="mt-1 font-medium">{metric.sourceName}</div>
          </div>
        </div>
        {metric.sourceType === "computed" && (
          <div className="text-xs font-medium text-[var(--muted-foreground)]">独自算出</div>
        )}
        {metric.isStale && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {metric.staleReason ?? "最新期間が古いため参考値です。"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComparisonChart({
  metric,
  regionCode,
  regionName,
  windowSize,
}: {
  metric: RegionalMetricSeries;
  regionCode: string;
  regionName: string;
  windowSize: number;
}) {
  const prefecturePoints = slicePoints(metric.pointsByRegion[regionCode] ?? [], windowSize);
  const nationalPoints = metric.pointsByRegion[NATIONAL_CODE] ?? [];
  const nationalMap = new Map(nationalPoints.map((point) => [point.period, point]));
  const chartPoints = prefecturePoints.map((point) => ({
    label: formatPeriod(point.period),
    prefecture: point.value,
    national: nationalMap.get(point.period)?.value ?? null,
  }));
  const hasData = chartPoints.some(
    (point) => point.prefecture !== null || point.national !== null,
  );

  return (
    <Card>
      <CardHeader className="border-b border-[var(--border-subtle)]">
        <CardTitle>{metric.title} 全国比較</CardTitle>
      </CardHeader>
      <CardContent className="pt-5">
        {!hasData ? (
          <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] text-sm text-[var(--muted-foreground)]">
            比較チャートに使えるデータがありません。
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartPoints} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  tickFormatter={(value) => formatNumber(Number(value), 0)}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: "1px solid var(--border-strong)",
                    backgroundColor: "rgba(255,255,255,0.97)",
                  }}
                  formatter={(value, name) => [
                    value === null ? "データなし" : formatValue(Number(value), metric.unit),
                    name === "prefecture" ? regionName : "全国",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="prefecture"
                  stroke="#2e5b78"
                  strokeWidth={2.6}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="national"
                  stroke="#a26b3f"
                  strokeWidth={2.2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function findSelectedMix(
  regional: RegionalDashboardSnapshot,
  regionCode: string,
) {
  return regional.housingMix.find((item) => item.regionCode === regionCode);
}

function findSelectedMomentum(
  regional: RegionalDashboardSnapshot,
  regionCode: string,
) {
  return regional.momentum.find((item) => item.regionCode === regionCode);
}

function mixRow(label: string, value: number | null, difference: number | null) {
  return (
    <tr key={label} className="border-b border-[var(--border-subtle)] last:border-b-0">
      <td className="px-4 py-3 font-medium">{label}</td>
      <td className="px-4 py-3 text-right">{formatValue(value, "%")}</td>
      <td className="px-4 py-3 text-right text-[var(--muted-foreground)]">
        {formatChange(difference, "pt")}
      </td>
    </tr>
  );
}

export function RegionalDashboard({ regional, windowSize }: RegionalDashboardProps) {
  const [selectedRegionCode, setSelectedRegionCode] = useState(
    regional?.defaultRegionCode ?? "",
  );
  const selectedRegion = regional?.prefectures.find(
    (prefecture) => prefecture.code === selectedRegionCode,
  );
  const selectedStartsMetric = regional ? getMetric(regional, "pref-housing-starts-total") : undefined;
  const selectedMix = regional ? findSelectedMix(regional, selectedRegionCode) : undefined;
  const selectedMomentum = regional
    ? findSelectedMomentum(regional, selectedRegionCode)
    : undefined;

  const detailMetrics = useMemo(() => {
    if (!regional) {
      return [];
    }

    return [
      "pref-housing-starts-total",
      "pref-housing-starts-owner",
      "pref-housing-starts-rental",
      "pref-housing-starts-for-sale",
      "pref-housing-floor-area",
      "pref-planned-construction-cost",
      "pref-public-construction-orders",
    ]
      .map((id) => getMetric(regional, id))
      .filter((metric): metric is RegionalMetricSeries => Boolean(metric));
  }, [regional]);

  if (!regional || regional.prefectures.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-[var(--muted-foreground)]">
          地域別データを取得できませんでした。統計ダッシュボード API の応答を確認してください。
        </CardContent>
      </Card>
    );
  }

  const topScores = [...regional.demandScores]
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
  const bottomScores = [...regional.demandScores]
    .sort((left, right) => left.score - right.score)
    .slice(0, 10);
  const availableRankingMetrics = RANKING_METRICS.map((id) => getMetric(regional, id)).filter(
    (metric): metric is RegionalMetricSeries => Boolean(metric),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold">都道府県別 住宅・建設市況</div>
          <div className="text-sm leading-6 text-[var(--muted-foreground)]">
            鮮度条件を満たした月次・四半期系列だけをランキングとカードに使います。
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          都道府県
          <select
            className="h-10 rounded-xl border border-[var(--border-strong)] bg-white px-3 text-sm"
            value={selectedRegionCode}
            onChange={(event) => setSelectedRegionCode(event.target.value)}
          >
            {regional.prefectures.map((prefecture) => (
              <option key={prefecture.code} value={prefecture.code}>
                {prefecture.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {demandScoreTable("地域住宅需要スコア 上位10（独自算出）", topScores)}
        {demandScoreTable("地域住宅需要スコア 下位10（独自算出）", bottomScores)}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {availableRankingMetrics.map((metric) => compactRanking(metric, regional))}
      </div>

      {selectedStartsMetric && selectedRegion && (
        <ComparisonChart
          metric={selectedStartsMetric}
          regionCode={selectedRegion.code}
          regionName={selectedRegion.name}
          windowSize={windowSize}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {detailMetrics.map((metric) => (
          <DetailMetricCard
            key={metric.indicatorId}
            metric={metric}
            regionCode={selectedRegionCode}
          />
        ))}
        {regional.costProxy && (
          <DetailMetricCard metric={regional.costProxy} regionCode={selectedRegionCode} />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-[var(--border-subtle)]">
            <CardTitle>
              {selectedRegion?.name ?? "選択地域"} 戸建・集合住宅ミックス
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {selectedMix ? (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-strong)] text-left text-[var(--muted-foreground)]">
                      <th className="px-4 py-3 font-medium">区分</th>
                      <th className="px-4 py-3 text-right font-medium">構成比</th>
                      <th className="px-4 py-3 text-right font-medium">全国差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mixRow("持家", selectedMix.ownerRatio, selectedMix.ownerDifferenceFromNational)}
                    {mixRow("貸家", selectedMix.rentalRatio, selectedMix.rentalDifferenceFromNational)}
                    {mixRow("分譲", selectedMix.forSaleRatio, selectedMix.forSaleDifferenceFromNational)}
                  </tbody>
                </table>
                <div className="rounded-2xl bg-[var(--surface-muted)] p-4 text-sm leading-6">
                  {selectedMix.comment}
                </div>
              </>
            ) : (
              <div className="text-sm text-[var(--muted-foreground)]">
                構成比を計算できる入力データがありません。
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-[var(--border-subtle)]">
            <CardTitle>
              {selectedRegion?.name ?? "選択地域"} 住宅着工モメンタム
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {selectedMomentum ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="neutral">{selectedMomentum.label}</Badge>
                  <div className="text-sm text-[var(--muted-foreground)]">独自算出</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                      短期モメンタム
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {formatChange(selectedMomentum.shortMomentum)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                      全国 {formatChange(selectedMomentum.nationalShortMomentum)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-muted)] p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                      中期トレンド
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {formatChange(selectedMomentum.mediumTrend)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                      全国 {formatChange(selectedMomentum.nationalMediumTrend)}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-[var(--muted-foreground)]">
                モメンタムを計算できる時系列が不足しています。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
