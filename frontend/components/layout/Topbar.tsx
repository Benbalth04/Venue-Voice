"use client"

import { Bell, User } from "lucide-react"
import { business } from "@/lib/dashboard/data"

export function Topbar() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Dashboard
        </div>
        <div className="text-sm font-semibold text-zinc-900">{business.name}</div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 inline-flex h-2 w-2 rounded-full bg-violet-500" />
        </button>
        <div className="flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700">
          <User className="h-4 w-4" />
          <span>Demo Admin</span>
        </div>
      </div>
    </header>
  )
}

