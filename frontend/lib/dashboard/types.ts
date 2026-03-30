// TypeScript interfaces mirroring the backend Pydantic survey dashboard schemas.
// Keep in sync with backend/app/schemas/pydantic_model.py

export interface DailyNumericPoint {
  date: string; // ISO date "YYYY-MM-DD"
  avg_value: number | null;
  count: number;
}

export interface DailySentimentPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface DailyDistributionPoint {
  date: string;
  distribution: Record<string, number>; // option_key → % of daily total
  total: number;
}

export interface RatingDistribution {
  buckets: Record<string, number>; // "1"–"5" → count
  total: number;
}

export interface ChoiceDistribution {
  buckets: Record<string, number>; // option_key → count
  total: number;
}

export interface SentimentDistribution {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface QuestionAggregation {
  stable_question_id: string;
  question_text: string;
  question_type: QuestionType;
  config: Record<string, unknown> | null;
  position: number;
  total_responses: number;
  // star
  rating_distribution?: RatingDistribution;
  daily_avg?: DailyNumericPoint[];
  // nps
  daily_nps_avg?: DailyNumericPoint[];
  // text / long_text
  sentiment_distribution?: SentimentDistribution;
  daily_sentiment?: DailySentimentPoint[];
  // multiple_choice / checkbox
  choice_distribution?: ChoiceDistribution;
  daily_choices?: DailyDistributionPoint[];
  // yes_no
  yes_no_distribution?: ChoiceDistribution;
  daily_yes_pct?: DailyNumericPoint[];
  // email / phone
  daily_count?: DailyNumericPoint[];
  // photo
  photo_count?: number;
  photo_urls?: string[];
}

export interface DailyCompletionPoint {
  date: string; // "YYYY-MM-DD"
  scans: number;
  completions: number;
  rate: number | null; // null when scans === 0
}

export interface EngagementData {
  total_scans: number;
  total_completions: number;
  daily_completion_rate: DailyCompletionPoint[];
}

export interface SurveyDashboardResponse {
  survey_id: string;
  survey_name: string;
  date_start: string;
  date_end: string;
  questions: QuestionAggregation[];
  engagement: EngagementData;
}

export interface OldQuestionsDashboardResponse {
  survey_id: string;
  questions: QuestionAggregation[];
}

// ── Breakdown (expanded chart drill-down) ────────────────────────────────────

export interface BreakdownSeries {
  series_id: string;
  series_name: string;
  aggregation: QuestionAggregation;
}

export interface QuestionBreakdownResponse {
  stable_question_id: string;
  breakdown_by: string;
  series: BreakdownSeries[];
}

export interface EngagementBreakdownSeries {
  series_id: string;
  series_name: string;
  total_scans: number;
  total_completions: number;
  daily_completion_rate: DailyCompletionPoint[];
}

export interface EngagementBreakdownResponse {
  breakdown_by: string;
  series: EngagementBreakdownSeries[];
}

export type ExpandChartContext =
  | {
      kind: "question";
      stableQuestionId: string;
      subChart:
        | "distribution"        // star rating histogram
        | "choice_distribution" // checkbox / multiple_choice bar
        | "timeseries"          // star avg / NPS avg over time
        | "yes_pct_line"        // yes_no % yes over time
        | "sentiment_bar"
        | "sentiment_line"
        | "stacked"
        | "pie"
        | "count_line";
    }
  | {
      kind: "engagement";
      subChart: "scan_completion" | "completion_rate";
    };

export type QuestionType =
  | "star"
  | "nps"
  | "text"
  | "long_text"
  | "multiple_choice"
  | "checkbox"
  | "yes_no"
  | "email"
  | "phone"
  | "photo";

export type TimePreset = "24h" | "7d" | "30d" | "90d" | "custom";

export interface FilterState {
  surveyId: string | null;
  locationIds: string[];
  qrCodeIds: string[];
  timePreset: TimePreset;
  dateStart: Date | null;
  dateEnd: Date | null;
}

export interface DashboardAPIParams {
  location_ids?: string[];
  qr_code_ids?: string[];
  date_start?: string;
  date_end?: string;
}

// Config shape for multiple_choice / checkbox options
export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionConfig {
  options?: QuestionOption[];
  [key: string]: unknown;
}
