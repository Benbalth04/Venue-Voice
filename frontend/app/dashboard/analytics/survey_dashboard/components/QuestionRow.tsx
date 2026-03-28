"use client";

import { useMemo } from "react";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { PieChart } from "@/components/charts/PieChart";
import { StackedBarChart } from "@/components/charts/StackedBarChart";
import { transformQuestion } from "@/lib/dashboard/transformers";
import type { QuestionAggregation } from "@/lib/dashboard/types";
import { ChartCard } from "./ChartCard";

const TYPE_LABELS: Record<string, string> = {
  star: "Rating",
  nps: "NPS",
  text: "Text",
  long_text: "Long Text",
  multiple_choice: "Multiple Choice",
  checkbox: "Checkbox",
  yes_no: "Yes / No",
  email: "Email",
  phone: "Phone",
  photo: "Photo",
};

interface Props {
  question: QuestionAggregation;
}

export function QuestionRow({ question }: Props) {
  const chartData = useMemo(() => transformQuestion(question), [question]);

  const isEmptyNumerics = (arr?: { count: number }[]) =>
    !arr || arr.length === 0 || arr.every((p) => p.count === 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Question header */}
      <div className="flex items-center gap-3">
        <span className="font-medium text-zinc-900 text-sm flex-1">
          {question.question_text}
        </span>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
          {TYPE_LABELS[question.question_type] ?? question.question_type}
        </span>
        <span className="text-xs text-zinc-500">
          {question.total_responses} responses
        </span>
      </div>

      {/* Chart grid — 1–2 columns, collapses to 1 on mobile */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
      >
        {chartData.type === "star" && (
          <>
            <ChartCard
              title="Rating Distribution"
              isEmpty={
                !question.rating_distribution ||
                question.rating_distribution.total === 0
              }
            >
              <BarChart {...chartData.histogramProps} />
            </ChartCard>
            <ChartCard
              title="Average Rating Over Time"
              isEmpty={isEmptyNumerics(question.daily_avg)}
            >
              <LineChart {...chartData.timeSeriesProps} />
            </ChartCard>
          </>
        )}

        {chartData.type === "nps" && (
          <ChartCard
            title="Average NPS Score Over Time"
            isEmpty={isEmptyNumerics(question.daily_nps_avg)}
          >
            <LineChart {...chartData.timeSeriesProps} />
          </ChartCard>
        )}

        {chartData.type === "text" && (
          <>
            <ChartCard
              title="Sentiment Distribution"
              isEmpty={
                !question.sentiment_distribution ||
                question.sentiment_distribution.total === 0
              }
            >
              <BarChart {...chartData.sentimentBarProps} />
            </ChartCard>
            <ChartCard
              title="Sentiment Over Time"
              isEmpty={!question.daily_sentiment || question.daily_sentiment.length === 0}
            >
              <LineChart {...chartData.sentimentLineProps} showLegend />
            </ChartCard>
          </>
        )}

        {chartData.type === "choice" && (
          <>
            <ChartCard
              title="Selection Distribution"
              isEmpty={
                !question.choice_distribution ||
                question.choice_distribution.total === 0
              }
            >
              <BarChart {...chartData.distributionBarProps} />
            </ChartCard>
            <ChartCard
              title="Selection Split Over Time"
              isEmpty={!question.daily_choices || question.daily_choices.length === 0}
            >
              <StackedBarChart {...chartData.stackedTimeProps} />
            </ChartCard>
          </>
        )}

        {chartData.type === "yes_no" && (
          <>
            <ChartCard
              title="Yes / No Distribution"
              isEmpty={
                !question.yes_no_distribution ||
                question.yes_no_distribution.total === 0
              }
            >
              <PieChart {...chartData.pieProps} />
            </ChartCard>
            <ChartCard
              title="% Yes Over Time"
              isEmpty={isEmptyNumerics(question.daily_yes_pct)}
            >
              <LineChart {...chartData.timeSeriesProps} />
            </ChartCard>
          </>
        )}

        {chartData.type === "email_phone" && (
          <ChartCard
            title="Responses Over Time"
            isEmpty={isEmptyNumerics(question.daily_count)}
          >
            <LineChart {...chartData.countLineProps} />
          </ChartCard>
        )}

        {chartData.type === "photo" && (
          <ChartCard title="Photo Responses" isEmpty={question.photo_count === 0}>
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-500">
                {question.photo_count ?? 0} photo{(question.photo_count ?? 0) !== 1 ? "s" : ""} collected
              </p>
            </div>
          </ChartCard>
        )}

        {chartData.type === "unknown" && (
          <ChartCard title="Unsupported question type" isEmpty>
            <></>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
