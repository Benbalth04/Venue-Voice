"use client";

import type { AnalyticsFilterOption } from "@/lib/api/client";
import type { FilterState, TimePreset } from "@/lib/dashboard/types";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { TimePresetSelector } from "./TimePresetSelector";

interface Props {
  locations: AnalyticsFilterOption[];
  qrCodes: AnalyticsFilterOption[];
  filters: FilterState;
  onFilterChange: (update: Partial<FilterState>) => void;
}

export function DashboardFilterBar({
  locations,
  qrCodes,
  filters,
  onFilterChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <MultiSelectFilter
        label="Locations"
        options={locations}
        selected={filters.locationIds}
        onChange={(locationIds) => onFilterChange({ locationIds })}
      />
      <MultiSelectFilter
        label="QR Codes"
        options={qrCodes}
        selected={filters.qrCodeIds}
        onChange={(qrCodeIds) => onFilterChange({ qrCodeIds })}
      />
      <TimePresetSelector
        value={filters.timePreset}
        onChange={(timePreset: TimePreset) => onFilterChange({ timePreset })}
        dateStart={filters.dateStart}
        dateEnd={filters.dateEnd}
        onDateStartChange={(dateStart) => onFilterChange({ dateStart })}
        onDateEndChange={(dateEnd) => onFilterChange({ dateEnd })}
      />
    </div>
  );
}
