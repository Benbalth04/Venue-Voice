"use client";

import { DropdownSelect, type DropdownOption } from "@/components/ui/DropdownSelect";

interface Option {
  id: string;
  name: string;
}

interface Props {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function MultiSelectFilter({ label, options, selected, onChange }: Props) {
  const dropdownOptions: DropdownOption[] = options.map((o) => ({
    value: o.id,
    label: o.name,
  }));

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
        {label}
      </label>
      <DropdownSelect
        options={dropdownOptions}
        value={selected}
        onChange={(next) => onChange(next as string[])}
        placeholder={`All ${label}`}
        multiple
        className="min-w-[160px]"
      />
    </div>
  );
}
