"use client";

import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { IndicatorSeries } from "@/lib/estat/types";

type ErrorSummaryProps = {
  indicators: IndicatorSeries[];
};

export function ErrorSummary({ indicators }: ErrorSummaryProps) {
  if (indicators.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50/90">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="space-y-2">
            <div className="text-sm font-semibold text-amber-900">
              一部の指標で取得に失敗しました
            </div>
            <ul className="space-y-1 text-sm leading-6 text-amber-800">
              {indicators.map((indicator) => (
                <li key={indicator.indicatorId}>
                  {indicator.title}: {indicator.errorMessage}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

