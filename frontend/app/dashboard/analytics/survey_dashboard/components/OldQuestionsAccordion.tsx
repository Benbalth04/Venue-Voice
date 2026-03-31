"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { LoadingBlock } from "@/components/ui/LoadingSpinner";
import type { FilterState } from "@/lib/dashboard/types";
import { useOldQuestionsData } from "../hooks/useDashboardData";
import { QuestionRow } from "./QuestionRow";

interface Props {
  surveyId: string;
  filters: FilterState;
  resolvedDates: { dateStart: Date; dateEnd: Date };
  userTimeZone: string;
}

export function OldQuestionsAccordion({
  surveyId,
  filters,
  resolvedDates,
  userTimeZone,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useOldQuestionsData(
    surveyId,
    filters,
    resolvedDates,
    userTimeZone,
    expanded,
  );

  const questionCount = data?.questions.length ?? 0;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-800 text-sm">
            Questions from previous versions
          </span>
          {data && questionCount > 0 && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
              {questionCount}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-5 py-4">
          {isLoading && <LoadingBlock message="Loading old questions…" size="md" />}
          {!isLoading && error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          {!isLoading && !error && questionCount === 0 && (
            <p className="text-sm text-zinc-400">
              No responses found for removed questions using the selected filters.
            </p>
          )}
          {!isLoading && !error && questionCount > 0 && (
            <div className="flex flex-col gap-8">
              {data!.questions.map((q) => (
                <QuestionRow key={q.stable_question_id} question={q} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
