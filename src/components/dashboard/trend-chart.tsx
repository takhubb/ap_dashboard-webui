"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { IndicatorPoint } from "@/lib/estat/types";
import { formatNumber, formatPeriod, slicePoints } from "@/lib/utils";

type TrendChartProps = {
  points: IndicatorPoint[];
  windowSize: number;
  compact?: boolean;
  unit?: string;
  valueLabel?: string;
  strokeColor?: string;
  emptyMessage?: string;
};

export function TrendChart({
  points,
  windowSize,
  compact = false,
  unit,
  valueLabel = "値",
  strokeColor = "#2e5b78",
  emptyMessage = "チャート表示に必要なデータがありません",
}: TrendChartProps) {
  const chartPoints = slicePoints(points, windowSize).map((point) => ({
    label: formatPeriod(point.period),
    period: point.period,
    value: point.value,
  }));
  const hasData = chartPoints.some(
    (point) => point.value !== null && !Number.isNaN(Number(point.value)),
  );

  if (chartPoints.length === 0 || !hasData) {
    return (
      <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] text-sm text-[var(--muted-foreground)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={compact ? "h-36 w-full" : "h-72 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartPoints} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
          <CartesianGrid stroke="rgba(148, 163, 184, 0.22)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={compact ? 24 : 12}
            tick={{ fill: "var(--muted-foreground)", fontSize: compact ? 11 : 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={compact ? 48 : 60}
            tick={{ fill: "var(--muted-foreground)", fontSize: compact ? 11 : 12 }}
            tickFormatter={(value) =>
              formatNumber(Number(value), unit === "%" ? 1 : 0)
            }
          />
          <Tooltip
            cursor={{ stroke: "rgba(39, 74, 99, 0.15)" }}
            contentStyle={{
              borderRadius: 16,
              border: "1px solid var(--border-strong)",
              backgroundColor: "rgba(255,255,255,0.97)",
              boxShadow: "0 16px 30px -24px rgba(15,23,42,0.45)",
            }}
            formatter={(value) => {
              if (value === null || value === undefined || value === "") {
                return ["データなし", valueLabel] as [string, string];
              }

              const numericValue = Number(value);
              if (Number.isNaN(numericValue)) {
                return ["データなし", valueLabel] as [string, string];
              }

              return [
                unit === "%"
                  ? `${formatNumber(numericValue, 1)}%`
                  : unit
                    ? `${formatNumber(numericValue, 1)} ${unit}`
                    : formatNumber(numericValue, 1),
                valueLabel,
              ] as [string, string];
            }}
            labelFormatter={(label) => label}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={compact ? 2.2 : 2.8}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: strokeColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
