/**
 * Pure transformation functions: QuestionAggregation → chart-ready props.
 * No side effects. All business logic for chart rendering lives here,
 * not in page or question components.
 */
import type {
  QuestionAggregation,
  QuestionConfig,
  QuestionType,
} from "./types";

// ── Chart prop interfaces ─────────────────────────────────────────────────────

export interface BarDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
}

export interface LineDataset {
  label: string;
  data: (number | null)[];
  borderColor?: string;
  backgroundColor?: string;
  tension?: number;
  fill?: boolean;
}

export interface BarChartProps {
  labels: string[];
  datasets: BarDataset[];
}

export interface LineChartProps {
  labels: string[];
  datasets: LineDataset[];
}

export interface PieChartProps {
  labels: string[];
  data: number[];
  backgroundColors?: string[];
}

export interface StackedBarChartProps {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string;
  }>;
}

// ── Discriminated union for per-type chart data ───────────────────────────────

export type QuestionChartData =
  | { type: "star"; histogramProps: BarChartProps; timeSeriesProps: LineChartProps }
  | { type: "nps"; timeSeriesProps: LineChartProps }
  | { type: "text"; sentimentBarProps: BarChartProps; sentimentLineProps: LineChartProps }
  | { type: "choice"; distributionBarProps: BarChartProps; stackedTimeProps: StackedBarChartProps }
  | { type: "yes_no"; pieProps: PieChartProps; timeSeriesProps: LineChartProps }
  | { type: "email_phone"; countLineProps: LineChartProps }
  | { type: "photo"; photoCount: number }
  | { type: "unknown" };

// ── Color palette ─────────────────────────────────────────────────────────────

export const CHART_COLORS = {
  primary: "#7c3aed",           // violet-600
  primaryFill: "rgba(124,58,237,0.10)",
  positive: "#22c55e",          // kept for sentiment only
  neutral: "#94a3b8",           // kept for sentiment only
  negative: "#ef4444",          // kept for sentiment only
  // Star ratings: violet-200 → violet-600 (low → high)
  starGradient: ["#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed"],
  // Yes/No: brand violet + light violet
  yesNoColors: ["#7c3aed", "#c4b5fd"],
  // Multi-option: distinct violet shades
  stackedPalette: [
    "#7c3aed", // violet-600
    "#a78bfa", // violet-400
    "#c4b5fd", // violet-300
    "#6d28d9", // violet-700
    "#8b5cf6", // violet-500
    "#4c1d95", // violet-900
    "#ddd6fe", // violet-200
    "#ede9fe", // violet-100
  ],
};

// ── Main dispatch ─────────────────────────────────────────────────────────────

export function transformQuestion(q: QuestionAggregation): QuestionChartData {
  switch (q.question_type as QuestionType) {
    case "star":
      return transformStar(q);
    case "nps":
      return transformNPS(q);
    case "text":
    case "long_text":
      return transformText(q);
    case "multiple_choice":
    case "checkbox":
      return transformChoice(q);
    case "yes_no":
      return transformYesNo(q);
    case "email":
    case "phone":
      return transformEmailPhone(q);
    case "photo":
      return { type: "photo", photoCount: q.photo_count ?? 0 };
    default:
      return { type: "unknown" };
  }
}

// ── Per-type transformers ─────────────────────────────────────────────────────

function transformStar(q: QuestionAggregation): QuestionChartData {
  const dist = q.rating_distribution ?? { buckets: {}, total: 0 };
  const histogramProps: BarChartProps = {
    labels: ["1 ★", "2 ★", "3 ★", "4 ★", "5 ★"],
    datasets: [
      {
        label: "Responses",
        data: ["1", "2", "3", "4", "5"].map((k) => dist.buckets[k] ?? 0),
        backgroundColor: CHART_COLORS.starGradient,
      },
    ],
  };

  const daily = q.daily_avg ?? [];
  const timeSeriesProps: LineChartProps = {
    labels: daily.map((p) => formatDate(p.date)),
    datasets: [
      {
        label: "Avg Rating",
        data: daily.map((p) => p.avg_value),
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primaryFill,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  return { type: "star", histogramProps, timeSeriesProps };
}

function transformNPS(q: QuestionAggregation): QuestionChartData {
  const daily = q.daily_nps_avg ?? [];
  const timeSeriesProps: LineChartProps = {
    labels: daily.map((p) => formatDate(p.date)),
    datasets: [
      {
        label: "Avg NPS Score",
        data: daily.map((p) => p.avg_value),
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primaryFill,
        tension: 0.4,
        fill: true,
      },
    ],
  };
  return { type: "nps", timeSeriesProps };
}

function transformText(q: QuestionAggregation): QuestionChartData {
  const dist = q.sentiment_distribution ?? {
    positive: 0,
    neutral: 0,
    negative: 0,
    total: 0,
  };
  const sentimentBarProps: BarChartProps = {
    labels: ["Positive", "Neutral", "Negative"],
    datasets: [
      {
        label: "Responses",
        data: [dist.positive, dist.neutral, dist.negative],
        backgroundColor: [
          CHART_COLORS.positive,
          CHART_COLORS.neutral,
          CHART_COLORS.negative,
        ],
      },
    ],
  };

  const daily = q.daily_sentiment ?? [];
  const sentimentLineProps: LineChartProps = {
    labels: daily.map((p) => formatDate(p.date)),
    datasets: [
      {
        label: "Positive",
        data: daily.map((p) => p.positive),
        borderColor: CHART_COLORS.positive,
        tension: 0.3,
      },
      {
        label: "Neutral",
        data: daily.map((p) => p.neutral),
        borderColor: CHART_COLORS.neutral,
        tension: 0.3,
      },
      {
        label: "Negative",
        data: daily.map((p) => p.negative),
        borderColor: CHART_COLORS.negative,
        tension: 0.3,
      },
    ],
  };

  return { type: "text", sentimentBarProps, sentimentLineProps };
}

function transformChoice(q: QuestionAggregation): QuestionChartData {
  const dist = q.choice_distribution ?? { buckets: {}, total: 0 };
  const config = q.config as QuestionConfig | null;
  const labelMap = buildOptionLabelMap(config);
  const keys = Object.keys(dist.buckets);

  const distributionBarProps: BarChartProps = {
    labels: keys.map((k) => labelMap[k] ?? k),
    datasets: [
      {
        label: "Selections",
        data: keys.map((k) => dist.buckets[k] ?? 0),
        backgroundColor: CHART_COLORS.stackedPalette.slice(0, keys.length),
      },
    ],
  };

  const daily = q.daily_choices ?? [];
  const allKeys = collectAllKeys(daily.map((p) => p.distribution), keys);
  const stackedTimeProps: StackedBarChartProps = {
    labels: daily.map((p) => formatDate(p.date)),
    datasets: allKeys.map((k, i) => ({
      label: labelMap[k] ?? k,
      data: daily.map((p) => p.distribution[k] ?? 0),
      backgroundColor:
        CHART_COLORS.stackedPalette[i % CHART_COLORS.stackedPalette.length],
    })),
  };

  return { type: "choice", distributionBarProps, stackedTimeProps };
}

function transformYesNo(q: QuestionAggregation): QuestionChartData {
  const dist = q.yes_no_distribution ?? { buckets: {}, total: 0 };
  const yes = dist.buckets["yes"] ?? 0;
  const no = dist.buckets["no"] ?? 0;

  const pieProps: PieChartProps = {
    labels: ["Yes", "No"],
    data: [yes, no],
    backgroundColors: CHART_COLORS.yesNoColors,
  };

  const daily = q.daily_yes_pct ?? [];
  const timeSeriesProps: LineChartProps = {
    labels: daily.map((p) => formatDate(p.date)),
    datasets: [
      {
        label: "% Yes",
        data: daily.map((p) => p.avg_value),
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primaryFill,
        tension: 0.4,
        fill: true,
      },
    ],
  };

  return { type: "yes_no", pieProps, timeSeriesProps };
}

function transformEmailPhone(q: QuestionAggregation): QuestionChartData {
  const daily = q.daily_count ?? [];
  const countLineProps: LineChartProps = {
    labels: daily.map((p) => formatDate(p.date)),
    datasets: [
      {
        label: "Responses",
        data: daily.map((p) => p.count),
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primaryFill,
        tension: 0.4,
        fill: true,
      },
    ],
  };
  return { type: "email_phone", countLineProps };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDate(isoDate: string): string {
  // "2024-03-15" → "Mar 15"
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildOptionLabelMap(
  config: QuestionConfig | null
): Record<string, string> {
  if (!config?.options) return {};
  return Object.fromEntries(config.options.map((o) => [o.value, o.label]));
}

function collectAllKeys(
  distributions: Record<string, number>[],
  fallbackKeys: string[]
): string[] {
  const keySet = new Set<string>(fallbackKeys);
  for (const d of distributions) {
    for (const k of Object.keys(d)) keySet.add(k);
  }
  return Array.from(keySet);
}
