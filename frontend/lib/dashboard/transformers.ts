/**
 * Pure transformation functions: QuestionAggregation → chart-ready props.
 * No side effects. All business logic for chart rendering lives here,
 * not in page or question components.
 */
import type {
  BreakdownSeries,
  DailyCompletionPoint,
  EngagementData,
  QuestionAggregation,
  QuestionBreakdownResponse,
  EngagementBreakdownResponse,
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

// ── Palette used in sidebar color swatches (same as stackedPalette) ───────────
export const SERIES_PALETTE = CHART_COLORS.stackedPalette;

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
  const keys = Object.keys(dist.buckets).sort((a, b) =>
    (labelMap[a] ?? a).localeCompare(labelMap[b] ?? b)
  );

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
  const allKeys = collectAllKeys(daily.map((p) => p.distribution), keys).sort((a, b) =>
    (labelMap[a] ?? a).localeCompare(labelMap[b] ?? b)
  );
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

/** Resolve series color: custom override first, then palette fallback. */
function seriesColor(
  seriesId: string,
  index: number,
  colorMap?: Record<string, string>
): string {
  return (
    colorMap?.[seriesId] ??
    CHART_COLORS.stackedPalette[index % CHART_COLORS.stackedPalette.length]
  );
}

// ── Engagement transformers ───────────────────────────────────────────────────

/** Bar chart: two bars showing total scans vs total completions. */
export function transformEngagementTotals(engagement: EngagementData): BarChartProps {
  return {
    labels: ["Scans", "Completions"],
    datasets: [
      {
        label: "Count",
        data: [engagement.total_scans, engagement.total_completions],
        backgroundColor: [CHART_COLORS.primary, CHART_COLORS.primaryFill.replace("0.10", "0.6")],
      },
    ],
  };
}

/** Line chart: daily completion rate (0–100 %). */
export function transformEngagementTimeSeries(engagement: EngagementData): LineChartProps {
  const daily = engagement.daily_completion_rate;
  return {
    labels: daily.map((p) => formatDate(p.date)),
    datasets: [
      {
        label: "Completion Rate (%)",
        data: daily.map((p) => (p.rate !== null ? +(p.rate * 100).toFixed(1) : null)),
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primaryFill,
        tension: 0.4,
        fill: true,
      },
    ],
  };
}

// ── Breakdown chart result type ───────────────────────────────────────────────

/**
 * Discriminated union returned by transformBreakdown.
 * The expanded modal uses chartType to decide which chart component to render.
 * "pies" is special: each series gets its own small pie chart.
 */
export type BreakdownChartResult =
  | { chartType: "bar"; props: BarChartProps }
  | { chartType: "line"; props: LineChartProps }
  | { chartType: "stacked"; props: StackedBarChartProps }
  | { chartType: "pies"; propsList: PieChartProps[] }
  | null;

// ── Breakdown transformer ─────────────────────────────────────────────────────

/**
 * Convert breakdown data (per-location or per-QR-code series) into
 * multi-series chart props suitable for the expanded chart modal.
 *
 * @param data        QuestionBreakdownResponse or EngagementBreakdownResponse
 * @param selectedIds Set of series_id strings currently in-graph
 * @param subChart    Which sub-chart type was expanded (from ExpandChartContext)
 * @param colorMap    Optional map of series_id → hex color (from sidebar color pickers)
 */
export function transformBreakdown(
  data: QuestionBreakdownResponse | EngagementBreakdownResponse,
  selectedIds: Set<string>,
  subChart: string,
  colorMap?: Record<string, string>
): BreakdownChartResult {
  // Engagement sub-charts have fixed names; everything else is a question chart.
  const isEngagement =
    subChart === "scan_completion" || subChart === "completion_rate";

  if (isEngagement) {
    return _transformEngagementBreakdown(
      data as EngagementBreakdownResponse,
      selectedIds,
      subChart,
      colorMap
    );
  }
  return _transformQuestionBreakdown(
    data as QuestionBreakdownResponse,
    selectedIds,
    subChart,
    colorMap
  );
}

function _transformEngagementBreakdown(
  data: EngagementBreakdownResponse,
  selectedIds: Set<string>,
  subChart: string,
  colorMap?: Record<string, string>
): BreakdownChartResult {
  const activeSeries = data.series.filter((s) => selectedIds.has(s.series_id));
  if (activeSeries.length === 0) return null;

  if (subChart === "scan_completion") {
    // Locations/QR codes on x-axis; Scans & Completions as datasets.
    return {
      chartType: "bar",
      props: {
        labels: activeSeries.map((s) => s.series_name),
        datasets: [
          {
            label: "Scans",
            data: activeSeries.map((s) => s.total_scans),
            backgroundColor: CHART_COLORS.primary,
          },
          {
            label: "Completions",
            data: activeSeries.map((s) => s.total_completions),
            backgroundColor: CHART_COLORS.primaryFill.replace("0.10", "0.6"),
          },
        ],
      },
    };
  }

  // completion_rate: multi-line, date-aligned
  const aligned = _alignCompletionRateSeries(
    activeSeries.map((s) => ({
      id: s.series_id,
      name: s.series_name,
      points: s.daily_completion_rate,
    }))
  );
  return {
    chartType: "line",
    props: {
      labels: aligned.labels,
      datasets: aligned.datasets.map((d, i) => ({
        label: d.name,
        data: d.data,
        borderColor: seriesColor(d.id, i, colorMap),
        backgroundColor: "transparent",
        tension: 0.4,
        fill: false,
      })),
    },
  };
}

function _transformQuestionBreakdown(
  data: QuestionBreakdownResponse,
  selectedIds: Set<string>,
  subChart: string,
  colorMap?: Record<string, string>
): BreakdownChartResult {
  const activeSeries = data.series.filter((s) => selectedIds.has(s.series_id));
  if (activeSeries.length === 0) return null;

  switch (subChart) {
    case "distribution":
      return _breakdownRatingDistribution(activeSeries, colorMap);
    case "choice_distribution":
      return _breakdownChoiceDistribution(activeSeries, colorMap);
    case "timeseries":
      return _breakdownTimeSeries(activeSeries, colorMap);
    case "yes_pct_line":
      return _breakdownYesPctLine(activeSeries, colorMap);
    case "sentiment_bar":
      return _breakdownSentimentBar(activeSeries);
    case "sentiment_line":
      return _breakdownSentimentLine(activeSeries);
    case "stacked":
      return _breakdownChoiceTimeline(activeSeries, colorMap);
    case "pie":
      return _breakdownPies(activeSeries);
    case "count_line":
      return _breakdownCountLine(activeSeries, colorMap);
    default:
      return null;
  }
}

/**
 * Grouped bar: locations/QR codes on x-axis, one dataset per star rating.
 * Uses the star gradient so colours match the unexpanded histogram.
 */
function _breakdownRatingDistribution(
  series: BreakdownSeries[],
  _colorMap?: Record<string, string>
): BreakdownChartResult {
  return {
    chartType: "bar",
    props: {
      labels: series.map((s) => s.series_name),
      datasets: ["1", "2", "3", "4", "5"].map((k, i) => ({
        label: `${k} ★`,
        data: series.map(
          (s) => s.aggregation.rating_distribution?.buckets[k] ?? 0
        ),
        backgroundColor: CHART_COLORS.starGradient[i],
      })),
    },
  };
}

/**
 * Grouped bar: locations/QR codes on x-axis, one dataset per choice option.
 * Each option keeps a consistent palette colour across all locations.
 */
function _breakdownChoiceDistribution(
  series: BreakdownSeries[],
  _colorMap?: Record<string, string>
): BreakdownChartResult {
  const config = series[0]?.aggregation.config as QuestionConfig | null;
  const labelMap = buildOptionLabelMap(config);
  const allBuckets = series.map((s) => s.aggregation.choice_distribution?.buckets ?? {});
  const allKeys = collectAllKeys(allBuckets, []).sort((a, b) =>
    (labelMap[a] ?? a).localeCompare(labelMap[b] ?? b)
  );
  return {
    chartType: "bar",
    props: {
      labels: series.map((s) => s.series_name),
      datasets: allKeys.map((k, i) => ({
        label: labelMap[k] ?? k,
        data: series.map(
          (s) => s.aggregation.choice_distribution?.buckets[k] ?? 0
        ),
        backgroundColor:
          CHART_COLORS.stackedPalette[i % CHART_COLORS.stackedPalette.length],
      })),
    },
  };
}

/** Multi-line: avg value (star avg or NPS avg) per series over time. */
function _breakdownTimeSeries(
  series: BreakdownSeries[],
  colorMap?: Record<string, string>
): BreakdownChartResult {
  const seriesData = series.map((s) => {
    const points = s.aggregation.daily_avg ?? s.aggregation.daily_nps_avg ?? [];
    return {
      id: s.series_id,
      name: s.series_name,
      points: points.map((p) => ({ date: p.date, value: p.avg_value })),
    };
  });
  const allDates = _unionDates(seriesData.map((s) => s.points.map((p) => p.date)));
  return {
    chartType: "line",
    props: {
      labels: allDates.map(formatDate),
      datasets: seriesData.map((s, i) => {
        const byDate = new Map(s.points.map((p) => [p.date, p.value]));
        return {
          label: s.name,
          data: allDates.map((d) => byDate.get(d) ?? null),
          borderColor: seriesColor(s.id, i, colorMap),
          backgroundColor: "transparent",
          tension: 0.4,
          fill: false,
        };
      }),
    },
  };
}

/** Multi-line: % yes per series over time. */
function _breakdownYesPctLine(
  series: BreakdownSeries[],
  colorMap?: Record<string, string>
): BreakdownChartResult {
  const seriesData = series.map((s) => ({
    id: s.series_id,
    name: s.series_name,
    points: (s.aggregation.daily_yes_pct ?? []).map((p) => ({
      date: p.date,
      value: p.avg_value,
    })),
  }));
  const allDates = _unionDates(seriesData.map((s) => s.points.map((p) => p.date)));
  return {
    chartType: "line",
    props: {
      labels: allDates.map(formatDate),
      datasets: seriesData.map((s, i) => {
        const byDate = new Map(s.points.map((p) => [p.date, p.value]));
        return {
          label: `${s.name} (% Yes)`,
          data: allDates.map((d) => byDate.get(d) ?? null),
          borderColor: seriesColor(s.id, i, colorMap),
          backgroundColor: "transparent",
          tension: 0.4,
          fill: false,
        };
      }),
    },
  };
}

/**
 * Grouped bar: locations/QR codes on x-axis, one dataset per sentiment.
 * Uses green / grey / red to match the unexpanded chart.
 */
function _breakdownSentimentBar(series: BreakdownSeries[]): BreakdownChartResult {
  return {
    chartType: "bar",
    props: {
      labels: series.map((s) => s.series_name),
      datasets: [
        {
          label: "Positive",
          data: series.map(
            (s) => s.aggregation.sentiment_distribution?.positive ?? 0
          ),
          backgroundColor: CHART_COLORS.positive,
        },
        {
          label: "Neutral",
          data: series.map(
            (s) => s.aggregation.sentiment_distribution?.neutral ?? 0
          ),
          backgroundColor: CHART_COLORS.neutral,
        },
        {
          label: "Negative",
          data: series.map(
            (s) => s.aggregation.sentiment_distribution?.negative ?? 0
          ),
          backgroundColor: CHART_COLORS.negative,
        },
      ],
    },
  };
}

/**
 * Three lines (Positive / Neutral / Negative) aggregated across selected series.
 * Uses green / grey / red colours to match the unexpanded chart.
 */
function _breakdownSentimentLine(series: BreakdownSeries[]): BreakdownChartResult {
  const allDates = _unionDates(
    series.map((s) => (s.aggregation.daily_sentiment ?? []).map((p) => p.date))
  );

  type SentimentKey = "positive" | "neutral" | "negative";
  const aggregate = (key: SentimentKey): (number | null)[] =>
    allDates.map((date) => {
      let total: number | null = null;
      for (const s of series) {
        const point = (s.aggregation.daily_sentiment ?? []).find(
          (p) => p.date === date
        );
        if (point) total = (total ?? 0) + point[key];
      }
      return total;
    });

  return {
    chartType: "line",
    props: {
      labels: allDates.map(formatDate),
      datasets: [
        {
          label: "Positive",
          data: aggregate("positive"),
          borderColor: CHART_COLORS.positive,
          backgroundColor: "transparent",
          tension: 0.3,
          fill: false,
        },
        {
          label: "Neutral",
          data: aggregate("neutral"),
          borderColor: CHART_COLORS.neutral,
          backgroundColor: "transparent",
          tension: 0.3,
          fill: false,
        },
        {
          label: "Negative",
          data: aggregate("negative"),
          borderColor: CHART_COLORS.negative,
          backgroundColor: "transparent",
          tension: 0.3,
          fill: false,
        },
      ],
    },
  };
}

/** Multi-line: total daily choice responses per series. */
function _breakdownChoiceTimeline(
  series: BreakdownSeries[],
  colorMap?: Record<string, string>
): BreakdownChartResult {
  const seriesData = series.map((s) => ({
    id: s.series_id,
    name: s.series_name,
    points: (s.aggregation.daily_choices ?? []).map((p) => ({
      date: p.date,
      value: p.total,
    })),
  }));
  const allDates = _unionDates(seriesData.map((s) => s.points.map((p) => p.date)));
  return {
    chartType: "line",
    props: {
      labels: allDates.map(formatDate),
      datasets: seriesData.map((s, i) => {
        const byDate = new Map(s.points.map((p) => [p.date, p.value]));
        return {
          label: s.name,
          data: allDates.map((d) => byDate.get(d) ?? null),
          borderColor: seriesColor(s.id, i, colorMap),
          backgroundColor: "transparent",
          tension: 0.3,
          fill: false,
        };
      }),
    },
  };
}

/** One pie chart per series (yes/no distribution). */
function _breakdownPies(series: BreakdownSeries[]): BreakdownChartResult {
  return {
    chartType: "pies",
    propsList: series.map((s) => {
      const dist = s.aggregation.yes_no_distribution ?? { buckets: {}, total: 0 };
      return {
        labels: ["Yes", "No"],
        data: [dist.buckets["yes"] ?? 0, dist.buckets["no"] ?? 0],
        backgroundColors: CHART_COLORS.yesNoColors,
      };
    }),
  };
}

/** Multi-line: daily response count per series (email/phone). */
function _breakdownCountLine(
  series: BreakdownSeries[],
  colorMap?: Record<string, string>
): BreakdownChartResult {
  const seriesData = series.map((s) => ({
    id: s.series_id,
    name: s.series_name,
    points: (s.aggregation.daily_count ?? []).map((p) => ({
      date: p.date,
      value: p.count,
    })),
  }));
  const allDates = _unionDates(seriesData.map((s) => s.points.map((p) => p.date)));
  return {
    chartType: "line",
    props: {
      labels: allDates.map(formatDate),
      datasets: seriesData.map((s, i) => {
        const byDate = new Map(s.points.map((p) => [p.date, p.value]));
        return {
          label: s.name,
          data: allDates.map((d) => byDate.get(d) ?? null),
          borderColor: seriesColor(s.id, i, colorMap),
          backgroundColor: "transparent",
          tension: 0.4,
          fill: false,
        };
      }),
    },
  };
}

// ── Date alignment helpers ────────────────────────────────────────────────────

function _unionDates(dateLists: string[][]): string[] {
  const set = new Set<string>();
  for (const list of dateLists) {
    for (const d of list) set.add(d);
  }
  return Array.from(set).sort();
}

function _alignCompletionRateSeries(
  seriesData: Array<{ id: string; name: string; points: DailyCompletionPoint[] }>
): {
  labels: string[];
  datasets: Array<{ id: string; name: string; data: (number | null)[] }>;
} {
  const allDates = _unionDates(seriesData.map((s) => s.points.map((p) => p.date)));
  return {
    labels: allDates.map(formatDate),
    datasets: seriesData.map((s) => {
      const byDate = new Map(
        s.points.map((p) => [
          p.date,
          p.rate !== null ? +(p.rate * 100).toFixed(1) : null,
        ])
      );
      return {
        id: s.id,
        name: s.name,
        data: allDates.map((d) => byDate.get(d) ?? null),
      };
    }),
  };
}

