"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { GitBranch, Mail, OctagonX, Workflow } from "lucide-react"
import type { ReadOnlyNodeData } from "../buildReadOnlyCanvas"

export function ReadOnlyFlowCanvasNode({ data }: NodeProps<Node<ReadOnlyNodeData>>) {
  const showSource = data.kind !== "terminate"
  const Icon =
    data.kind === "trigger" || data.kind === "rule"
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
      {data.kind !== "trigger" ? (
        <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-zinc-300" />
      ) : null}
      {showSource ? (
        <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-violet-500" />
      ) : null}

      <div
        className={[
          "flex h-auto w-[280px] flex-col justify-start overflow-hidden rounded-2xl border bg-white px-4 py-4 shadow-sm transition-all",
          data.executed
            ? "border-emerald-500 ring-2 ring-emerald-200 shadow-md"
            : "border-zinc-200 opacity-40",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${accentClass}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                {data.label}
              </span>
              {data.executed ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  executed
                </span>
              ) : null}
            </div>
            <p className="mt-3 font-semibold text-zinc-950 leading-snug">{data.title}</p>
            {data.subtitleLines.length > 0 ? (
              <div className="mt-1.5 space-y-0.5">
                {data.subtitleLines.map((line, i) => (
                  <p
                    key={i}
                    className={[
                      "text-sm leading-5",
                      line.startsWith("✓") || line.startsWith("→ True")
                        ? "text-emerald-600 font-medium"
                        : line.startsWith("✗") || line.startsWith("→ False")
                          ? "text-red-500 font-medium"
                          : "text-zinc-500",
                    ].join(" ")}
                  >
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
