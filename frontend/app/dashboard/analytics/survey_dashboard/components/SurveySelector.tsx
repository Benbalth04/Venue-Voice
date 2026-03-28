"use client";

import { Button } from "@/components/ui/button";
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect";
import type { SurveyListItem } from "@/lib/api/client";

interface Props {
  surveys: SurveyListItem[];
  selectedSurveyId: string | null;
  onSelect: (id: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
}

export function SurveySelector({
  surveys,
  selectedSurveyId,
  onSelect,
  onGenerate,
  isLoading,
}: Props) {
  const options = surveys.map((s) => ({ value: s.id, label: s.title }));

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Survey
        </label>
        <SingleSelectDropdown
          options={options}
          value={selectedSurveyId ?? ""}
          onChange={onSelect}
          placeholder="Select a survey…"
          disabled={isLoading && surveys.length === 0}
        />
      </div>
      <Button
        onClick={onGenerate}
        disabled={!selectedSurveyId || isLoading}
        className="shrink-0"
      >
        {isLoading ? "Generating…" : "Generate Dashboard"}
      </Button>
    </div>
  );
}
