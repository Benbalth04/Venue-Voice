"use client"

import { Card } from "@/components/ui/card"

export function MetricCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string | number
  helper?: string
}) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="text-2xl font-semibold text-zinc-950">{value}</div>
      {helper ? (
        <div className="text-xs text-zinc-500">{helper}</div>
      ) : null}
    </Card>
  )
}

