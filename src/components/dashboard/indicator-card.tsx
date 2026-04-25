"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { IndicatorDialog } from "@/components/dashboard/indicator-dialog";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { IndicatorSeries } from "@/lib/estat/types";
import {
  buildYearOverYearPoints,
  formatChange,
  formatPeriod,
  formatValue,
  getYearOverYearLabel,
  toneFromChange,
} from "@/lib/utils";

type IndicatorCardProps = {
  series: IndicatorSeries;
  windowSize: number;
};

function ChangeIcon({ value }: { value: number | null }) {
  const tone = toneFromChange(value);
  if (tone === "positive") {
    return <ArrowUpRight className="h-3.5 w-3.5" />;
  }

  if (tone === "negative") {
    return <ArrowDownRight className="h-3.5 w-3.5" />;
  }

  return <Minus className="h-3.5 w-3.5" />;
}

export function IndicatorCard({ series, windowSize }: IndicatorCardProps) {
  const tone = toneFromChange(series.changeRate);
  const yearOverYearPoints = buildYearOverYearPoints(series.points);
  const yearOverYearLabel = getYearOverYearLabel(series.lastPeriod);
  const hasYearOverYearData = yearOverYearPoints.some((point) => point.value !== null);

  return (
    <Card className="h-full">
      <CardHeader className="border-b border-[var(--border-subtle)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{series.title}</CardTitle>
            <CardDescription>{series.notes}</CardDescription>
          </div>
          <IndicatorDialog
            series={series}
            windowSize={windowSize}
            yearOverYearLabel={yearOverYearLabel}
            yearOverYearPoints={yearOverYearPoints}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {series.status === "error" ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
                {series.errorMessage}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                出典: {series.sourceName}
              </div>
            </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  最新値
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-tight">
                  {formatValue(series.latestValue, series.unit)}
                </div>
              </div>
              <Badge variant={tone}>
                <ChangeIcon value={series.changeRate} />
                {series.changeLabel} {formatChange(series.changeRate, series.changeSuffix)}
              </Badge>
            </div>

            <TrendChart points={series.points} unit={series.unit} windowSize={windowSize} compact />

            {hasYearOverYearData && (
              <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/65 p-3">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  {yearOverYearLabel}トレンド
                </div>
                <TrendChart
                  points={yearOverYearPoints}
                  unit="%"
                  windowSize={windowSize}
                  compact
                  valueLabel={yearOverYearLabel}
                  strokeColor="#8c6a43"
                  emptyMessage={`${yearOverYearLabel}を計算できる期間がまだありません`}
                />
              </div>
            )}

            <div className="grid gap-3 rounded-2xl bg-[var(--surface-muted)] p-4 text-sm md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  最終更新対象
                </div>
                <div className="mt-1 font-medium">{formatPeriod(series.lastPeriod)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  出典
                </div>
                <div className="mt-1 font-medium">{series.sourceName}</div>
              </div>
            </div>

            {series.isStale && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {series.staleReason ?? "最新期間が古いため参考値です。"}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
