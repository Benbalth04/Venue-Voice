"use client"

import type { BillingInterval } from "@/lib/subscription/plans"

export function BillingToggle({
  value,
  onChange,
}: {
  value: BillingInterval
  onChange: (v: BillingInterval) => void
}) {
  return (
    <div className="mx-auto mb-8 w-full max-w-xs overflow-visible">
      <div
        className="flex overflow-visible rounded-full border border-zinc-200 bg-zinc-100 p-1"
        role="tablist"
        aria-label="Billing period"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === "monthly"}
          className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
            value === "monthly" ? "bg-white text-violet-700 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
          }`}
          onClick={() => onChange("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === "yearly"}
          aria-label="Yearly billing, 20% off"
          className={`relative flex-1 overflow-visible rounded-full py-2.5 pl-3 pr-7 text-sm font-medium transition-colors ${
            value === "yearly" ? "bg-white text-violet-700 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
          }`}
          onClick={() => onChange("yearly")}
        >
          <span className="relative z-0 block text-center">Yearly</span>
          <span
            className="pointer-events-none absolute right-1 top-0 z-10 origin-top-right rotate-[10deg] rounded-br-sm rounded-tl-sm rounded-tr-sm bg-violet-600 px-1.5 py-0.5 text-[0.6rem] font-extrabold uppercase leading-none tracking-wide text-white shadow-md ring-1 ring-violet-500/40"
            aria-hidden
          >
            20% off
          </span>
        </button>
      </div>
    </div>
  )
}
