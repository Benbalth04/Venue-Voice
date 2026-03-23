"use client"

import { useState } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { GitBranch, Mail, OctagonX, Plus, Workflow } from "lucide-react"
import type { AddNodeData } from "../types"

const ADD_STEP_ITEMS_FULL = [
  { id: "rule" as const, label: "Rule", icon: Workflow },
  { id: "branch" as const, label: "Branch", icon: GitBranch },
  { id: "action" as const, label: "Action", icon: Mail },
  { id: "terminate" as const, label: "Terminate", icon: OctagonX },
]
const ADD_STEP_ITEMS_AFTER_ACTION = [
  { id: "action" as const, label: "Action", icon: Mail },
  { id: "terminate" as const, label: "Terminate", icon: OctagonX },
]

export function AddStepFlowCanvasNode({ data }: NodeProps<Node<AddNodeData>>) {
  const [open, setOpen] = useState(false)
  const items = data.chainAfterAction ? ADD_STEP_ITEMS_AFTER_ACTION : ADD_STEP_ITEMS_FULL
  return (
    <div className="relative flex items-center gap-3">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-zinc-300" />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-violet-300 bg-white text-violet-600 shadow-sm transition hover:border-violet-400 hover:bg-violet-50"
      >
        <Plus className="h-4 w-4" />
      </button>
      <span className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 shadow-sm">
        Add step
      </span>
      {open ? (
        <div className="absolute left-14 top-1/2 z-[10000] flex min-w-40 -translate-y-1/2 flex-col rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  data.onAdd(item.id)
                  setOpen(false)
                }}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <Icon className="h-4 w-4 text-zinc-500" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
