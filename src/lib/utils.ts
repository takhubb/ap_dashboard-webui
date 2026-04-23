import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type { IndicatorPoint } from "@/lib/estat/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number, fractionDigits = 1) {
  return new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatValue(value: number | null, unit?: string) {
  if (value === null || Number.isNaN(value)) {
    return "データなし";
  }

  const digits = unit === "%" ? 1 : Math.abs(value) >= 100 ? 0 : 1;
  const formatted = formatNumber(value, digits);

  if (!unit || unit === "指数") {
    return unit ? `${formatted} ${unit}` : formatted;
  }

  if (unit === "%") {
    return `${formatted}%`;
  }

  return `${formatted} ${unit}`;
}

export function formatChange(
  value: number | null,
  suffix: "%" | "pt" = "%",
) {
  if (value === null || Number.isNaN(value)) {
    return "データなし";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}${suffix}`;
}

export function formatPeriod(period: string) {
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return `${monthMatch[1]}年${Number(monthMatch[2])}月`;
  }

  const quarterMatch = period.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    const quarter = Number(quarterMatch[2]);
    const startMonth = quarter * 3 - 2;
    const endMonth = quarter * 3;
    return `${quarterMatch[1]}年${startMonth}〜${endMonth}月期`;
  }

  const yearMatch = period.match(/^(\d{4})$/);
  if (yearMatch) {
    return `${yearMatch[1]}年`;
  }

  return period;
}

function getPointsPerYear(period: string) {
  if (period.includes("-Q")) {
    return 4;
  }

  if (period.includes("-")) {
    return 12;
  }

  return 1;
}

function getWindowPointCount(points: IndicatorPoint[], monthWindow: number) {
  const lastPoint = points.at(-1);
  if (!lastPoint) {
    return 0;
  }

  const pointsPerYear = getPointsPerYear(lastPoint.period);
  return Math.max(Math.ceil((monthWindow / 12) * pointsPerYear), 1);
}

function getYearOverYearOffset(period: string) {
  return getPointsPerYear(period);
}

export function slicePoints(points: IndicatorPoint[], monthWindow: number) {
  const pointCount = getWindowPointCount(points, monthWindow);
  return points.slice(Math.max(points.length - pointCount, 0));
}

export function buildYearOverYearPoints(points: IndicatorPoint[]) {
  return points.map((point, index) => {
    const offset = getYearOverYearOffset(point.period);
    const referencePoint = index >= offset ? points[index - offset] : undefined;

    if (
      point.value === null ||
      referencePoint?.value === null ||
      referencePoint?.value === undefined ||
      referencePoint.value === 0
    ) {
      return {
        period: point.period,
        sortKey: point.sortKey,
        value: null,
      };
    }

    return {
      period: point.period,
      sortKey: point.sortKey,
      value: ((point.value - referencePoint.value) / Math.abs(referencePoint.value)) * 100,
    };
  });
}

export function getYearOverYearLabel(period: string) {
  if (period.includes("-Q")) {
    return "前年同期比";
  }

  if (period.includes("-")) {
    return "前年同月比";
  }

  return "前年比";
}

export function toneFromChange(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "neutral";
  }

  if (value > 0) {
    return "positive";
  }

  if (value < 0) {
    return "negative";
  }

  return "neutral";
}
