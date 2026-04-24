"use client";

import { Loader2, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type DashboardHeaderProps = {
  lastUpdatedAt: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "未更新";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function DashboardHeader({
  lastUpdatedAt,
  isRefreshing,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(63,108,133,0.18),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(201,181,152,0.22),transparent_30%)]" />
        <div className="relative grid gap-6 px-6 py-7 md:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <div className="inline-flex rounded-full border border-[var(--border-strong)] bg-white/80 px-3 py-1 text-xs font-medium tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
              Housing & Macro Briefing
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
                住宅・建設市況ダッシュボード
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
                建材メーカー向けに、住宅・建設、マクロ、雇用、消費の主要指標を
                公式統計ソースからまとめて取得し、足元の変化を短時間で把握できるようにした画面です。
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-[var(--border-strong)] bg-white/90 p-5">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                更新状況
              </div>
              <div className="mt-2 text-xl font-semibold">
                {isRefreshing ? "更新中..." : "手動更新可能"}
              </div>
              <div className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                最終更新時刻: {formatTimestamp(lastUpdatedAt)}
              </div>
            </div>

            <Button
              size="lg"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="w-full justify-center"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  最新データを取得中
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4" />
                  最新データを取得
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
