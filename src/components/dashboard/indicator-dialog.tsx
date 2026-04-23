"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TrendChart } from "@/components/dashboard/trend-chart";
import type { IndicatorPoint, IndicatorSeries } from "@/lib/estat/types";
import { formatChange, formatPeriod, formatValue, slicePoints } from "@/lib/utils";

type IndicatorDialogProps = {
  series: IndicatorSeries;
  windowSize: number;
  yearOverYearLabel: string;
  yearOverYearPoints: IndicatorPoint[];
};

export function IndicatorDialog({
  series,
  windowSize,
  yearOverYearLabel,
  yearOverYearPoints,
}: IndicatorDialogProps) {
  const hasYearOverYearData = yearOverYearPoints.some((point) => point.value !== null);
  const yearOverYearMap = new Map(
    yearOverYearPoints.map((point) => [point.period, point.value]),
  );
  const tablePoints = [...slicePoints(series.points, windowSize)].reverse();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          詳細
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{series.title}</DialogTitle>
          <DialogDescription>
            {series.notes ?? "統計の位置づけを短時間で確認できるよう、直近推移を表示しています。"}
          </DialogDescription>
        </DialogHeader>

        {series.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {series.errorMessage}
          </div>
        ) : (
          <>
            <div className="grid gap-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-muted)] p-4 md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  最新値
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatValue(series.latestValue, series.unit)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  {series.changeLabel}
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatChange(series.changeRate, series.changeSuffix)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  最終更新対象
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatPeriod(series.lastPeriod)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="text-sm font-medium">水準推移</div>
                <TrendChart
                  points={series.points}
                  unit={series.unit}
                  windowSize={windowSize}
                  valueLabel="値"
                />
              </div>

              {hasYearOverYearData && (
                <div className="space-y-3">
                  <div className="text-sm font-medium">{yearOverYearLabel}トレンド</div>
                  <TrendChart
                    points={yearOverYearPoints}
                    unit="%"
                    windowSize={windowSize}
                    valueLabel={yearOverYearLabel}
                    strokeColor="#8c6a43"
                    emptyMessage={`${yearOverYearLabel}を計算できる期間がまだありません`}
                  />
                </div>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--border-strong)]">
              <div className="border-b border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-3 text-sm font-medium">
                時系列データ
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-[var(--border-strong)] text-left text-[var(--muted-foreground)]">
                      <th className="px-4 py-3 font-medium">期間</th>
                      <th className="px-4 py-3 font-medium">値</th>
                      {hasYearOverYearData && (
                        <th className="px-4 py-3 font-medium">{yearOverYearLabel}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tablePoints.map((point) => (
                      <tr
                        key={point.period}
                        className="border-b border-[var(--border-subtle)] last:border-b-0"
                      >
                        <td className="px-4 py-3">{formatPeriod(point.period)}</td>
                        <td className="px-4 py-3">{formatValue(point.value, series.unit)}</td>
                        {hasYearOverYearData && (
                          <td className="px-4 py-3">
                            {formatChange(yearOverYearMap.get(point.period) ?? null)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-xs leading-6 text-[var(--muted-foreground)]">
              出典: {series.sourceName}（e-Stat ベース）
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
