"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { CATEGORY_LABELS } from "@/config/indicators";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ErrorSummary } from "@/components/dashboard/error-summary";
import { IndicatorCard } from "@/components/dashboard/indicator-card";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardSnapshot, IndicatorCategory } from "@/lib/estat/types";

type DashboardShellProps = {
  initialSnapshot: DashboardSnapshot;
};

const RANGE_OPTIONS = [12, 36, 60, 120] as const;

export function DashboardShell({ initialSnapshot }: DashboardShellProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeCategory, setActiveCategory] = useState<IndicatorCategory>("housing");
  const [windowSize, setWindowSize] = useState<(typeof RANGE_OPTIONS)[number]>(12);
  const [isPending, startTransition] = useTransition();

  const errorIndicators = useMemo(
    () => snapshot.indicators.filter((indicator) => indicator.status === "error"),
    [snapshot.indicators],
  );

  const indicatorsByCategory = useMemo(() => {
    return snapshot.indicators.reduce<Record<IndicatorCategory, typeof snapshot.indicators>>(
      (accumulator, indicator) => {
        accumulator[indicator.category].push(indicator);
        return accumulator;
      },
      {
        housing: [],
        macro: [],
        employment: [],
        consumption: [],
      },
    );
  }, [snapshot]);

  const handleRefresh = async () => {
    try {
      const response = await fetch("/api/dashboard/refresh?force=1", {
        cache: "no-store",
      });
      const nextSnapshot = (await response.json()) as DashboardSnapshot;

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });

      if (nextSnapshot.missingAppId) {
        toast.warning("ESTAT_APP_ID が未設定のため、e-Stat 系の一部指標は取得できません。");
        return;
      }

      if (nextSnapshot.errorCount > 0) {
        toast.warning(
          `${nextSnapshot.successCount}件更新、${nextSnapshot.errorCount}件は要確認です。`,
        );
        return;
      }

      toast.success("全指標を更新しました。");
    } catch {
      toast.error("更新に失敗しました。ネットワークまたは API 設定を確認してください。");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
      <DashboardHeader
        isRefreshing={isPending}
        lastUpdatedAt={snapshot.lastUpdatedAt}
        onRefresh={handleRefresh}
      />

      {snapshot.missingAppId && (
        <Card className="border-rose-200 bg-rose-50/95">
          <CardContent className="p-5">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-rose-900">
                e-Stat の appId を設定すると対象指標を拡張できます
              </div>
              <div className="text-sm leading-6 text-rose-800">
                公式サイトから直接取得する指標は表示できますが、e-Stat 依存の系列は
                .env に <code className="rounded bg-white px-1.5 py-0.5">ESTAT_APP_ID</code> を設定すると取得可能になります。
                既存の <code className="rounded bg-white px-1.5 py-0.5">ESTAT_APP_KEY</code> も互換的に読み取ります。
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <SummaryCards indicators={snapshot.indicators} />
      <ErrorSummary indicators={errorIndicators} />

      <Card>
        <CardContent className="space-y-6 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold">カテゴリ別に確認</div>
              <div className="text-sm text-[var(--muted-foreground)]">
                直近 {windowSize}
                か月相当のトレンドを表示しています。前年同期比は計算可能な系列のみ追加表示します。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {RANGE_OPTIONS.map((range) => (
                <Button
                  key={range}
                  variant={range === windowSize ? "default" : "outline"}
                  size="sm"
                  onClick={() => setWindowSize(range)}
                >
                  {range}か月
                </Button>
              ))}
            </div>
          </div>

          <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as IndicatorCategory)}>
            <TabsList>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            {(
              Object.keys(CATEGORY_LABELS) as IndicatorCategory[]
            ).map((category) => (
              <TabsContent key={category} value={category}>
                <div className="grid gap-4 xl:grid-cols-2">
                  {indicatorsByCategory[category].map((indicator) => (
                    <IndicatorCard
                      key={indicator.indicatorId}
                      series={indicator}
                      windowSize={windowSize}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
