"use client";

import { SUMMARY_INDICATOR_IDS } from "@/config/indicators";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { IndicatorSeries } from "@/lib/estat/types";
import { formatChange, formatValue, toneFromChange } from "@/lib/utils";

type SummaryCardsProps = {
  indicators: IndicatorSeries[];
};

export function SummaryCards({ indicators }: SummaryCardsProps) {
  const cards = SUMMARY_INDICATOR_IDS.map((id) =>
    indicators.find((indicator) => indicator.indicatorId === id),
  ).filter((indicator): indicator is IndicatorSeries => Boolean(indicator));

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((series) => {
        const tone = toneFromChange(series.changeRate);
        return (
          <Card key={series.indicatorId}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{series.title}</div>
                  <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {series.status === "ok" ? series.sourceName : "取得エラー"}
                  </div>
                </div>
                <Badge variant={tone}>
                  {series.status === "ok"
                    ? `${series.changeLabel} ${formatChange(series.changeRate, series.changeSuffix)}`
                    : "要確認"}
                </Badge>
              </div>
              <div className="text-3xl font-semibold tracking-tight">
                {formatValue(series.latestValue, series.unit)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

