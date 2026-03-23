"use client"

import { useState } from "react"
import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react"
import { GitBranch, Mail, OctagonX, Plus, Workflow } from "lucide-react"
import type { EdgeInsertData } from "../types"

function orthoPathMidpoint(sx: number, sy: number, tx: number, ty: number) {
  const midX = (sx + tx) / 2
  const points: Array<[number, number]> = [
    [sx, sy],
    [midX, sy],
    [midX, ty],
    [tx, ty],
  ]
  let total = 0
  const lengths: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1][0] - points[i][0]
    const dy = points[i + 1][1] - points[i][1]
    const len = Math.hypot(dx, dy)
    lengths.push(len)
    total += len
  }
  if (total <= 0) return { x: sx, y: sy }
  let remaining = total / 2
  for (let i = 0; i < points.length - 1; i++) {
    const len = lengths[i]
    if (remaining <= len) {
      const t = len > 0 ? remaining / len : 0
      return {
        x: points[i][0] + (points[i + 1][0] - points[i][0]) * t,
        y: points[i][1] + (points[i + 1][1] - points[i][1]) * t,
      }
    }
    remaining -= len
  }
  return { x: tx, y: ty }
}

export function OrthoFlowEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, label, data }: EdgeProps) {
  const [insertOpen, setInsertOpen] = useState(false)
  const midX = (sourceX + targetX) / 2
  const edgePath = `M ${sourceX} ${sourceY} H ${midX} V ${targetY} H ${targetX}`
  const edgeData = data as EdgeInsertData | undefined
  const onInsert = edgeData?.onInsert
  const insertOptions = edgeData?.insertOptions ?? (["rule", "branch"] as const)
  const sameRow = Math.abs(sourceY - targetY) < 0.5
  let pillX: number
  let pillY: number
  if (label) {
    pillX = (sourceX + midX) / 2
    pillY = sourceY
  } else if (sameRow) {
    pillX = midX
    pillY = (sourceY + targetY) / 2
  } else {
    const p = orthoPathMidpoint(sourceX, sourceY, targetX, targetY)
    pillX = p.x
    pillY = p.y
  }
  const labelX = midX
  const labelY = (sourceY + targetY) / 2

  const INSERT_ICONS: Record<string, typeof Workflow> = {
    rule: Workflow,
    branch: GitBranch,
    action: Mail,
    terminate: OctagonX,
  }
  const INSERT_LABELS: Record<string, string> = {
    rule: "Insert rule",
    branch: "Insert branch",
    action: "Insert action",
    terminate: "Insert terminate",
  }

  return (
    <>
      <g style={{ pointerEvents: "none" }}>
        <path
          id={id}
          className="react-flow__edge-path"
          d={edgePath}
          fill="none"
          stroke="#a1a1aa"
          strokeWidth={2}
          markerEnd={markerEnd}
        />
      </g>
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "auto", zIndex: 20 }}
            className="nodrag nopan rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-500 shadow-sm"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {onInsert ? (
        <EdgeLabelRenderer>
          <div
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${pillX}px, ${pillY}px)`, pointerEvents: "auto", zIndex: 30 }}
            className="nodrag nopan relative"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setInsertOpen((v) => !v)
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-violet-300 bg-white text-violet-500 shadow-sm transition hover:border-violet-500 hover:bg-violet-50 hover:text-violet-700"
            >
              <Plus className="h-3 w-3" />
            </button>
            {insertOpen ? (
              <div className="absolute bottom-full left-1/2 z-[10000] mb-1 flex min-w-40 -translate-x-1/2 flex-col rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
                {insertOptions.map((opt) => {
                  const Icon = INSERT_ICONS[opt] ?? Workflow
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onInsert(opt)
                        setInsertOpen(false)
                      }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      <Icon className="h-3.5 w-3.5 text-zinc-500" />
                      <span>{INSERT_LABELS[opt] ?? opt}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
