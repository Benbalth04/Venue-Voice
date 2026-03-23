"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { GitBranch, Mail, OctagonX, Trash2, Workflow } from "lucide-react"
import type { CanvasNodeData } from "../types"

export function FlowCanvasNodeView({ data }: NodeProps<Node<CanvasNodeData>>) {
  const showSource = data.kind !== "terminate"
  const Icon =
    data.kind === "trigger"
      ? Workflow
      : data.kind === "rule"
        ? Workflow
        : data.kind === "branch"
          ? GitBranch
          : data.kind === "terminate"
            ? OctagonX
            : Mail
  const accentClass =
    data.kind === "trigger"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : data.kind === "rule"
        ? "bg-violet-50 text-violet-700 border-violet-200"
        : data.kind === "branch"
          ? "bg-sky-50 text-sky-700 border-sky-200"
          : data.kind === "terminate"
            ? "bg-rose-50 text-rose-700 border-rose-200"
            : "bg-emerald-50 text-emerald-700 border-emerald-200"
  return (
    <div className="relative">
      {data.kind !== "trigger" ? <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-zinc-300" /> : null}
      {showSource ? <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-violet-500" /> : null}
      <button
        type="button"
        onClick={data.onSelect}
        className={[
          "flex h-auto w-[280px] flex-col justify-start overflow-hidden rounded-2xl border bg-white px-4 py-4 text-left shadow-sm transition",
          data.errorHighlight
            ? "border-red-500 shadow-md ring-2 ring-red-200"
            : data.selected
              ? "border-violet-500 shadow-md ring-2 ring-violet-200"
              : "border-zinc-200 hover:border-zinc-300 hover:shadow-md",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${accentClass}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                {data.label}
              </span>
            </div>
            <p className="mt-3 truncate font-semibold text-zinc-950">{data.title}</p>
            {data.subtitle ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">{data.subtitle}</p> : null}
          </div>
          {data.onDelete ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                data.onDelete?.()
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  event.stopPropagation()
                  data.onDelete?.()
                }
              }}
              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <Trash2 className="h-4 w-4" />
            </span>
          ) : null}
        </div>
      </button>
    </div>
  )
}
