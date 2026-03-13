"use client"

import { useMemo, useState } from "react"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { TrendChart, type TrendPoint } from "@/components/dashboard/TrendChart"
import { Button } from "@/components/ui/button"
import {
  business,
  locations,
  qrCodes,
  responses,
  surveysSummary,
  scanEvents,
} from "@/lib/dashboard/data"
import Link from "next/link"

export default function DashboardOverviewPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const totalSubmissions = responses.length
  const totalScans = scanEvents.length
  const activeSurveys = surveysSummary.filter((s) => s.status === "active").length
  const activeQRCodes = qrCodes.filter((q) => q.active).length
  const activeLocations = locations.filter((l) => l.active).length

  const submissionTrend: TrendPoint[] = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const r of responses) {
      const day = r.timestamp.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }))
  }, [])

  const scanTrend: TrendPoint[] = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const s of scanEvents) {
      const day = s.timestamp.slice(0, 10)
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label, value }))
  }, [])

  const submissionsForSelectedDay = useMemo(
    () =>
      selectedDate
        ? responses.filter((r) => r.timestamp.startsWith(selectedDate))
        : [],
    [selectedDate],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Welcome back, Demo Admin
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            You are viewing analytics for{" "}
            <span className="font-medium text-zinc-900">{business.name}</span>.
          </p>
        </div>
        <Link href="/dashboard/surveys/create">
          <Button>Create survey</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total submissions" value={totalSubmissions} />
        <MetricCard label="Total scans" value={totalScans} />
        <MetricCard label="Active surveys" value={activeSurveys} />
        <MetricCard label="Active QR codes" value={activeQRCodes} />
        <MetricCard label="Active locations" value={activeLocations} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TrendChart
          title="Submissions over time"
          points={submissionTrend}
          onPointClick={(p) => setSelectedDate(p.label)}
        />
        <TrendChart
          title="Scans over time"
          points={scanTrend}
          onPointClick={(p) => setSelectedDate(p.label)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Active surveys</h2>
          <div className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            {surveysSummary
              .filter((s) => s.status === "active")
              .map((s) => (
                <Link
                  key={s.id}
                  href="/dashboard/analytics"
                  className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-zinc-50"
                >
                  <span>{s.title}</span>
                  <span className="text-xs text-zinc-500">
                    {s.questionCount} questions
                  </span>
                </Link>
              ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Active QR codes</h2>
          <div className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            {qrCodes
              .filter((q) => q.active)
              .slice(0, 5)
              .map((q) => (
                <Link
                  key={q.id}
                  href="/dashboard/distribution"
                  className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-zinc-50"
                >
                  <span>{q.name}</span>
                  <span className="text-xs text-zinc-500">
                    {q.scanCount} scans
                  </span>
                </Link>
              ))}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Active venues</h2>
          <div className="space-y-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            {locations
              .filter((l) => l.active)
              .map((l) => (
                <Link
                  key={l.id}
                  href="/dashboard/locations"
                  className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-zinc-50"
                >
                  <span>{l.name}</span>
                </Link>
              ))}
          </div>
        </div>
      </div>

      {selectedDate ? (
        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">
              Submissions on {selectedDate}
            </h2>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => setSelectedDate(null)}
            >
              Clear
            </Button>
          </div>
          {submissionsForSelectedDay.length === 0 ? (
            <p className="text-xs text-zinc-500">No submissions for this date.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto text-xs text-zinc-700">
              {submissionsForSelectedDay.map((r) => (
                <div
                  key={r.id}
                  className="border-b border-zinc-100 py-2 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <span>
                      Response #{r.id} at {new Date(r.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      QR #{r.qrCodeId} · Loc #{r.locationId}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

