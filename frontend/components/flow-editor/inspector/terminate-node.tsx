"use client"

import { OctagonX } from "lucide-react"

export function FlowTerminateInspector() {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
      <div className="flex items-start gap-3">
        <OctagonX className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
        <div>
          <p className="font-medium">Terminate path</p>
          <p className="mt-1 text-rose-700">
            Flow execution ends at this node. No furthur action will be taken on this path.
          </p>
        </div>
      </div>
    </div>
  )
}
